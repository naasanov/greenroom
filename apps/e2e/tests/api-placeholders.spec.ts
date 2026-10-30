import { memberships, userInstruments, users } from "@greenroom/db";
import { and, eq, isNull } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const ctx: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api: ctx };
}

const draft = {
  displayName: "Pat Placeholder",
  instruments: { presets: ["drums"], custom: ["Cowbell"] },
  email: "pat@example.com",
  notes: "Plays when free",
};

test("admin adds, edits and removes a roster-only member; members cannot", async ({
  testApi,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const ava = await client(testApi, "ava@example.com");
  const cleo = await client(testApi, "cleo@example.com");

  expect(
    (
      await cleo.api.post(`/bands/${id}/placeholders`, { data: draft })
    ).status(),
  ).toBe(403);
  expect(
    (
      await ava.api.post(`/bands/${id}/placeholders`, {
        data: { displayName: "" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await ava.api.post(`/bands/${id}/placeholders`, { data: draft })).status(),
  ).toBe(204);

  const list = await (await ava.api.get(`/bands/${id}/members`)).json();
  const pat = list.find(
    (m: { displayName: string }) => m.displayName === "Pat Placeholder",
  );
  expect(pat).toMatchObject({
    isPlaceholder: true,
    email: "pat@example.com",
    notes: "Plays when free",
    role: "member",
    instruments: { presets: ["drums"], custom: ["Cowbell"] },
  });
  expect(
    list.filter((m: { isPlaceholder: boolean }) => m.isPlaceholder),
  ).toHaveLength(1);

  const patch = await ava.api.patch(`/bands/${id}/placeholders/${pat.userId}`, {
    data: {
      displayName: "Patricia",
      email: null,
      instruments: { presets: [], custom: [] },
    },
  });
  expect(patch.status()).toBe(204);
  const after = (await (await ava.api.get(`/bands/${id}/members`)).json()).find(
    (m: { userId: string }) => m.userId === pat.userId,
  );
  expect(after).toMatchObject({
    displayName: "Patricia",
    email: "",
    instruments: { presets: [], custom: [] },
  });

  // Real members are not editable through the placeholder route, and placeholders cannot be admins.
  expect(
    (
      await ava.api.patch(`/bands/${id}/placeholders/${cleo.user.id}`, {
        data: { displayName: "X" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await ava.api.patch(`/bands/${id}/members/${pat.userId}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(400);

  expect(
    (await ava.api.delete(`/bands/${id}/members/${pat.userId}`)).status(),
  ).toBe(204);
  const gone = await (await ava.api.get(`/bands/${id}/members`)).json();
  expect(gone.some((m: { userId: string }) => m.userId === pat.userId)).toBe(
    false,
  );
  await Promise.all([ava.api.dispose(), cleo.api.dispose()]);
});

test("joining user claims a placeholder: merged in one step, placeholder deleted", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const ava = await client(testApi, "ava@example.com");
  await ava.api.post(`/bands/${id}/placeholders`, { data: draft });
  const token = (await (await ava.api.get(`/bands/${id}/invite`)).json()).token;
  const pat = (await (await ava.api.get(`/bands/${id}/members`)).json()).find(
    (m: { isPlaceholder: boolean }) => m.isPlaceholder,
  );

  const anonymous = await pwRequest.newContext({ baseURL: API_URL });
  expect((await anonymous.get(`/invites/${token}/placeholders`)).status()).toBe(
    401,
  );

  const joiner = await client(testApi, "joiner@example.com");
  await db.insert(userInstruments).values({
    userId: joiner.user.id,
    presetKey: "drums",
    position: 0,
  });
  const listed = await (
    await joiner.api.get(`/invites/${token}/placeholders`)
  ).json();
  expect(listed).toEqual([
    {
      userId: pat.userId,
      displayName: "Pat Placeholder",
      instruments: { presets: ["drums"], custom: ["Cowbell"] },
    },
  ]);

  // A real member id is not a valid claim target.
  const bad = await joiner.api.post(`/invites/${token}/link`, {
    data: { placeholderUserId: seeded.users.cleo.id },
  });
  expect(bad.status()).toBe(409);
  expect((await bad.json()).code).toBe("PLACEHOLDER_NOT_LINKABLE");

  const ok = await joiner.api.post(`/invites/${token}/link`, {
    data: { placeholderUserId: pat.userId },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ id, role: "member" });

  expect(
    await db.select().from(users).where(eq(users.id, pat.userId)),
  ).toHaveLength(0);
  const rows = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, joiner.user.id), isNull(memberships.leftAt)),
    );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(pat.membershipId);
  const ins = await (await joiner.api.get("/me/instruments")).json();
  expect(ins).toEqual({ presets: ["drums"], custom: ["Cowbell"] });

  // Already a member: nothing to claim, linking again is a no-op.
  expect(
    await (await joiner.api.get(`/invites/${token}/placeholders`)).json(),
  ).toEqual([]);
  await ava.api.post(`/bands/${id}/placeholders`, {
    data: { displayName: "Second" },
  });
  const second = (
    await (await ava.api.get(`/bands/${id}/members`)).json()
  ).find((m: { isPlaceholder: boolean }) => m.isPlaceholder);
  const again = await joiner.api.post(`/invites/${token}/link`, {
    data: { placeholderUserId: second.userId },
  });
  expect(again.status()).toBe(200);
  expect(
    await db.select().from(users).where(eq(users.id, second.userId)),
  ).toHaveLength(1);
  await Promise.all([
    ava.api.dispose(),
    joiner.api.dispose(),
    anonymous.dispose(),
  ]);
});

test("a sole real member can still leave only by deleting the band", async ({
  testApi,
}) => {
  const solo = await client(testApi, "solo@example.com");
  const band = await (
    await solo.api.post("/bands", { data: { name: "Solo" } })
  ).json();
  await solo.api.post(`/bands/${band.id}/placeholders`, {
    data: { displayName: "Ghost" },
  });
  const res = await solo.api.post(`/bands/${band.id}/leave`, { data: {} });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("ONLY_MEMBER_MUST_DELETE");
  await solo.api.dispose();
});
