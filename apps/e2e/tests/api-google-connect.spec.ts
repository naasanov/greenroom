import {
  BANDS,
  USERS,
  bandGoogleLinks,
  bands,
  oauthStates,
} from "@greenroom/db";
import { eq } from "drizzle-orm";
import type { APIRequestContext } from "@playwright/test";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { apiWithCookie } from "./spotify-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const BAND = BANDS.nightOwls.id;
const BASE = `/bands/${BAND}/integrations/google`;
const CALLBACK = "/integrations/google/callback";
const SCOPE = {
  drive: "https://www.googleapis.com/auth/drive",
  calendar: "https://www.googleapis.com/auth/calendar",
} as const;

async function clientFor(
  testApi: {
    login(email: string): Promise<{ cookie: { name: string; value: string } }>;
  },
  email: string,
): Promise<APIRequestContext> {
  const { cookie } = await testApi.login(email);
  return apiWithCookie(cookie);
}

async function start(
  api: APIRequestContext,
  service: "drive" | "calendar",
  redirectTo = "/band/media",
) {
  const res = await api.get(`${BASE}/${service}/start`, {
    params: { redirectTo },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = new URL(res.headers()["location"]!);
  return { location, state: location.searchParams.get("state")! };
}

async function callback(
  api: APIRequestContext,
  params: Record<string, string>,
): Promise<URL> {
  const res = await api.get(CALLBACK, { params, maxRedirects: 0 });
  expect(res.status()).toBe(302);
  return new URL(res.headers()["location"]!);
}

test("link, status, picker config, replay, role checks, and unlink", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);

  const unlinked = await (await ava.get(BASE)).json();
  expect(unlinked).toEqual({
    drive: {
      linked: false,
      email: null,
      linkedBy: null,
      linkedAt: null,
      folderId: null,
    },
    calendar: {
      linked: false,
      email: null,
      linkedBy: null,
      linkedAt: null,
      calendarId: null,
    },
  });
  const noPicker = await ava.get(`${BASE}/drive/picker-config`);
  expect(noPicker.status()).toBe(409);
  expect((await noPicker.json()).code).toBe("GOOGLE_NOT_LINKED");

  // Any member can start; the authorize URL carries the service scope.
  const { location, state } = await start(ben, "drive");
  expect(location.searchParams.get("scope")).toBe(
    `openid email ${SCOPE.drive}`,
  );
  expect(location.searchParams.get("access_type")).toBe("offline");
  expect(location.searchParams.get("prompt")).toBe("consent select_account");
  expect(location.searchParams.get("include_granted_scopes")).toBe("false");
  expect(new URL(location.searchParams.get("redirect_uri")!).pathname).toBe(
    CALLBACK,
  );
  const [stateRow] = await db.select().from(oauthStates);
  expect(stateRow).toMatchObject({
    bandId: BAND,
    purpose: "drive",
    userId: USERS.ben.id,
  });

  const dest = await callback(ava, {
    code: "fake-code:band@example.com",
    state,
  });
  expect(dest.origin).toBe(WEB_URL);
  expect(dest.pathname).toBe("/band/media");
  expect(dest.searchParams.get("google")).toBe("connected");
  expect(dest.searchParams.get("service")).toBe("drive");

  const linked = await (await ava.get(BASE)).json();
  expect(linked.drive).toMatchObject({
    linked: true,
    email: "band@example.com",
    linkedBy: { userId: USERS.ben.id, displayName: USERS.ben.displayName },
    folderId: null,
  });
  expect(linked.drive.linkedAt).toEqual(expect.any(String));
  expect(linked.calendar.linked).toBe(false);

  const [row] = await db.select().from(bandGoogleLinks);
  expect(row!.scopes).toContain(SCOPE.drive);
  expect(row!.refreshTokenEncrypted.startsWith("v1.")).toBe(true);
  const [band] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(band!.driveLinkedByUserId).toBe(USERS.ben.id);

  const picker = await ben.get(`${BASE}/drive/picker-config`);
  expect(picker.status()).toBe(200);
  expect(await picker.json()).toMatchObject({
    accessToken: expect.stringMatching(/^fake-access-/),
    fake: true,
  });

  // State is single use.
  const replay = await callback(ava, {
    code: "fake-code:band@example.com",
    state,
  });
  expect(replay.pathname).toBe("/");
  expect(replay.searchParams.get("google")).toBe("error");
  expect(replay.searchParams.get("reason")).toBe("invalid_state");

  // Calendar links independently, with a different account.
  const cal = await start(ava, "calendar", "/band/events");
  expect(cal.location.searchParams.get("scope")).toBe(
    `openid email ${SCOPE.calendar}`,
  );
  const calDest = await callback(ava, {
    code: "fake-code:cal@example.com",
    state: cal.state,
  });
  expect(calDest.searchParams.get("service")).toBe("calendar");
  const both = await (await ava.get(BASE)).json();
  expect(both.drive.email).toBe("band@example.com");
  expect(both.calendar.email).toBe("cal@example.com");
  expect(both.calendar.linkedBy.userId).toBe(USERS.ava.id);

  // Unlinking drive needs an admin and leaves calendar alone.
  await db
    .update(bands)
    .set({ driveRootFolderId: "folder-1" })
    .where(eq(bands.id, BAND));
  expect((await ben.delete(`${BASE}/drive`)).status()).toBe(403);
  expect((await ava.delete(`${BASE}/drive`)).status()).toBe(204);
  expect((await ava.delete(`${BASE}/drive`)).status()).toBe(204);
  const after = await (await ava.get(BASE)).json();
  expect(after.drive).toMatchObject({ linked: false, folderId: null });
  expect(after.calendar.linked).toBe(true);
  const [cleared] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(cleared!.driveRootFolderId).toBeNull();
  expect(cleared!.driveLinkedByUserId).toBeNull();
  expect(cleared!.calendarLinkedByUserId).toBe(USERS.ava.id);

  await ava.dispose();
  await ben.dispose();
});

test("callback reports denial, bad redirectTo falls back to /, and unknown services 404", async ({
  testApi,
  playwright,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const anon = await playwright.request.newContext({ baseURL: API_URL });

  const denied = await start(ava, "drive", "https://evil.example/x");
  const url = await callback(anon, {
    error: "access_denied",
    state: denied.state,
  });
  expect(url.origin).toBe(WEB_URL);
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("google")).toBe("error");
  expect(url.searchParams.get("reason")).toBe("denied");
  expect(url.searchParams.get("service")).toBe("drive");

  const bogus = await callback(anon, { code: "bogus", state: "nope" });
  expect(bogus.searchParams.get("reason")).toBe("invalid_state");

  const badCode = await start(ava, "calendar");
  const failed = await callback(anon, {
    code: "garbage",
    state: badCode.state,
  });
  expect(failed.searchParams.get("reason")).toBe("exchange_failed");

  expect(
    (await ava.get(`${BASE}/mail/start`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  const noSession = await anon.get(BASE);
  expect(noSession.status()).toBe(401);
  await ava.dispose();
  await anon.dispose();
});

test("non-members get 404 on every band route", async ({ testApi }) => {
  await testApi.seed("band");
  // Cleo belongs to Night Owls only, so Side Project is foreign to her.
  const cleo = await clientFor(testApi, USERS.cleo.email);
  const foreign = `/bands/${BANDS.sideProject.id}/integrations/google`;
  const calls = [
    await cleo.get(foreign),
    await cleo.get(`${foreign}/drive/start`, { maxRedirects: 0 }),
    await cleo.get(`${foreign}/calendar/start`, { maxRedirects: 0 }),
    await cleo.get(`${foreign}/drive/picker-config`),
    await cleo.delete(`${foreign}/drive`),
  ];
  for (const res of calls) expect(res.status()).toBe(404);
  await cleo.dispose();
});
