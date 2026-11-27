import { oauthConnections, oauthStates } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { API_PORT, API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import { apiWithCookie } from "./spotify-helpers.js";
import {
  YOUTUBE_CALLBACK as CALLBACK,
  connectYoutube,
  startYoutube,
} from "./youtube-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";

async function client(testApi: TestApi) {
  const { user, cookie } = await testApi.login("a@example.com");
  const api = await apiWithCookie(cookie);
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  return { user, api, exportUrl: `/bands/${band.id}/songs/export/youtube` };
}

test("start asks Google for offline youtube access with the API callback", async ({
  testApi,
}) => {
  const { api } = await client(testApi);
  const { location, state } = await startYoutube(api, "/library");
  expect(location.searchParams.get("redirect_uri")).toBe(
    `http://localhost:${API_PORT}${CALLBACK}`,
  );
  expect(location.searchParams.get("scope")?.split(" ")).toContain(
    YOUTUBE_SCOPE,
  );
  expect(location.searchParams.get("access_type")).toBe("offline");
  expect(location.searchParams.get("prompt")).toBe("consent");
  expect(location.searchParams.get("include_granted_scopes")).toBe("false");
  expect(state.length).toBeGreaterThan(20);
  await api.dispose();
});

test("start requires a session", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: API_URL });
  const res = await anon.get("/integrations/youtube/start", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
  await anon.dispose();
});

test("callback connects, redirects with youtube=connected, and status/disconnect work", async ({
  testApi,
  db,
}) => {
  const { user, api } = await client(testApi);
  expect(await (await api.get("/integrations/youtube")).json()).toEqual({
    connected: false,
    displayName: null,
  });

  const { state } = await startYoutube(api, "/library?tab=songs");
  const cb = await api.get(CALLBACK, {
    params: { code: "fake-code:casey@example.com", state },
    maxRedirects: 0,
  });
  expect(cb.status()).toBe(302);
  const dest = new URL(cb.headers()["location"]!);
  expect(dest.origin).toBe(WEB_URL);
  expect(dest.pathname).toBe("/library");
  expect(dest.searchParams.get("tab")).toBe("songs");
  expect(dest.searchParams.get("youtube")).toBe("connected");

  expect(await (await api.get("/integrations/youtube")).json()).toEqual({
    connected: true,
    displayName: "casey@example.com",
  });
  const [row] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, user.id));
  expect(row!.provider).toBe("youtube");
  expect(row!.scopes).toContain(YOUTUBE_SCOPE);
  // Tokens are stored encrypted, never as the raw fake token.
  expect(row!.refreshTokenEncrypted.startsWith("v1.")).toBe(true);
  expect(row!.refreshTokenEncrypted).not.toContain("fake-refresh");

  // Connecting again keeps a single connection per user.
  await connectYoutube(api, "casey2@example.com");
  expect(
    await db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, user.id)),
  ).toHaveLength(1);

  expect((await api.delete("/integrations/youtube")).status()).toBe(204);
  expect(await (await api.get("/integrations/youtube")).json()).toEqual({
    connected: false,
    displayName: null,
  });
  // Disconnecting twice is fine.
  expect((await api.delete("/integrations/youtube")).status()).toBe(204);
  await api.dispose();
});

test("a YouTube connection does not touch the Spotify connection", async ({
  testApi,
}) => {
  const { api } = await client(testApi);
  await connectYoutube(api);
  expect(
    (await (await api.get("/integrations/spotify")).json()).connected,
  ).toBe(false);
  await api.dispose();
});

test("the callback works without a session cookie and rejects bad, reused, and expired state", async ({
  testApi,
  playwright,
  db,
}) => {
  const { api } = await client(testApi);
  const anon = await playwright.request.newContext({ baseURL: API_URL });
  const call = async (params: Record<string, string>) => {
    const res = await anon.get(CALLBACK, { params, maxRedirects: 0 });
    expect(res.status()).toBe(302);
    return new URL(res.headers()["location"]!);
  };
  const ok = "fake-code:ok@example.com";

  expect(
    (await call({ code: ok, state: "nope" })).searchParams.get("youtube"),
  ).toBe("error");
  expect((await call({ code: ok })).searchParams.get("youtube")).toBe("error");

  const { state } = await startYoutube(api);
  expect((await call({ code: ok, state })).searchParams.get("youtube")).toBe(
    "connected",
  );
  // Single use.
  expect((await call({ code: ok, state })).searchParams.get("youtube")).toBe(
    "error",
  );

  const expired = await startYoutube(api);
  await db.update(oauthStates).set({ expiresAt: new Date(Date.now() - 1000) });
  expect(
    (await call({ code: ok, state: expired.state })).searchParams.get(
      "youtube",
    ),
  ).toBe("error");

  // An unexchangeable code is an error and does not connect.
  await api.delete("/integrations/youtube");
  const s2 = await startYoutube(api);
  expect(
    (await call({ code: "garbage", state: s2.state })).searchParams.get(
      "youtube",
    ),
  ).toBe("error");
  expect(
    (await (await api.get("/integrations/youtube")).json()).connected,
  ).toBe(false);

  // User denial keeps the return path and reports an error.
  const s3 = await startYoutube(api, "/library");
  const denied = await call({ error: "access_denied", state: s3.state });
  expect(denied.pathname).toBe("/library");
  expect(denied.searchParams.get("youtube")).toBe("error");

  // Off-site redirectTo values fall back to "/".
  const s4 = await startYoutube(api, "//evil.example/x");
  const fallback = await call({ code: ok, state: s4.state });
  expect(fallback.origin).toBe(WEB_URL);
  expect(fallback.pathname).toBe("/");
  await anon.dispose();
  await api.dispose();
});

test("a Spotify state cannot complete a YouTube connection", async ({
  testApi,
  playwright,
}) => {
  const { api } = await client(testApi);
  const res = await api.get("/integrations/spotify/start", {
    maxRedirects: 0,
  });
  const state = new URL(res.headers()["location"]!).searchParams.get("state")!;
  const anon = await playwright.request.newContext({ baseURL: API_URL });
  const cb = await anon.get(CALLBACK, {
    params: { code: "fake-code:x@example.com", state },
    maxRedirects: 0,
  });
  expect(new URL(cb.headers()["location"]!).searchParams.get("youtube")).toBe(
    "error",
  );
  expect(
    (await (await api.get("/integrations/youtube")).json()).connected,
  ).toBe(false);
  await anon.dispose();
  await api.dispose();
});

test("an expired access token is refreshed transparently", async ({
  testApi,
  db,
}) => {
  const { user, api, exportUrl } = await client(testApi);
  await connectYoutube(api);
  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  const res = await api.post(exportUrl, { data: { name: "Refresh" } });
  // The refresh succeeded, so the export reached the song check (no linked songs).
  expect(res.status()).toBe(422);
  const [row] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, user.id));
  expect(row!.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  await api.dispose();
});

test("invalid-grant on refresh removes the connection and asks to connect", async ({
  testApi,
  db,
}) => {
  const { user, api, exportUrl } = await client(testApi);
  await connectYoutube(api);
  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  await testApi.revokeGoogleRefreshTokens();

  const res = await api.post(exportUrl, { data: { name: "Revoked" } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: "YOUTUBE_LOGIN_REQUIRED" });
  expect(
    await db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, user.id)),
  ).toHaveLength(0);
  expect(
    (await (await api.get("/integrations/youtube")).json()).connected,
  ).toBe(false);
  await api.dispose();
});
