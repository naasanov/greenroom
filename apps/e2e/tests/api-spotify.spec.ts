import { oauthConnections, oauthStates } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import {
  apiWithCookie,
  connectSpotify,
  startSpotify,
} from "./spotify-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const CALLBACK = "/integrations/spotify/callback";
const PLAYLIST = "https://open.spotify.com/playlist/fakePlaylistPublic";

async function bandWithClient(testApi: TestApi, email = "a@example.com") {
  const { user, cookie } = await testApi.login(email);
  const api = await apiWithCookie(cookie);
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  return { user, api, base: `/bands/${band.id}/songs` as string };
}

test("start redirects to the authorize URL with the loopback redirect URI and all scopes", async ({
  testApi,
}) => {
  const { api } = await bandWithClient(testApi);
  const { location, state } = await startSpotify(api, "/library");
  expect(location.searchParams.get("redirect_uri")).toBe(
    `http://127.0.0.1:4100${CALLBACK}`,
  );
  expect(location.searchParams.get("scope")).toBe(
    "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public",
  );
  expect(state.length).toBeGreaterThan(20);
  await api.dispose();
});

test("start requires a session", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: API_URL });
  const res = await anon.get("/integrations/spotify/start", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
  await anon.dispose();
});

test("callback connects, redirects with spotify=connected, and status/disconnect work", async ({
  testApi,
  db,
}) => {
  const { user, api } = await bandWithClient(testApi);
  expect(await (await api.get("/integrations/spotify")).json()).toEqual({
    connected: false,
    displayName: null,
  });

  const { state } = await startSpotify(api, "/library?tab=songs");
  const cb = await api.get(CALLBACK, {
    params: { code: "fake-code:Casey", state },
    maxRedirects: 0,
  });
  expect(cb.status()).toBe(302);
  const dest = new URL(cb.headers()["location"]!);
  expect(dest.origin).toBe(WEB_URL);
  expect(dest.pathname).toBe("/library");
  expect(dest.searchParams.get("tab")).toBe("songs");
  expect(dest.searchParams.get("spotify")).toBe("connected");

  expect(await (await api.get("/integrations/spotify")).json()).toEqual({
    connected: true,
    displayName: "Casey",
  });
  const [row] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, user.id));
  expect(row!.provider).toBe("spotify");
  // Tokens are stored encrypted, never as the raw fake token.
  expect(row!.refreshTokenEncrypted.startsWith("v1.")).toBe(true);
  expect(row!.refreshTokenEncrypted).not.toContain("fake-spotify-refresh");

  // Connecting again keeps a single connection per user.
  await connectSpotify(api, "Casey2");
  expect(
    await db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, user.id)),
  ).toHaveLength(1);
  expect(
    (await (await api.get("/integrations/spotify")).json()).displayName,
  ).toBe("Casey2");

  expect((await api.delete("/integrations/spotify")).status()).toBe(204);
  expect(await (await api.get("/integrations/spotify")).json()).toEqual({
    connected: false,
    displayName: null,
  });
  await api.dispose();
});

test("the callback works without a session cookie and rejects bad, reused, and expired state", async ({
  testApi,
  playwright,
  db,
}) => {
  const { api } = await bandWithClient(testApi);
  const anon = await playwright.request.newContext({ baseURL: API_URL });
  const call = async (params: Record<string, string>) => {
    const res = await anon.get(CALLBACK, { params, maxRedirects: 0 });
    expect(res.status()).toBe(302);
    return new URL(res.headers()["location"]!);
  };

  const bad = await call({ code: "fake-code:x", state: "nope" });
  expect(bad.searchParams.get("spotify")).toBe("error");
  expect(
    (await call({ code: "fake-code:x" })).searchParams.get("spotify"),
  ).toBe("error");

  const { state } = await startSpotify(api);
  expect(
    (await call({ code: "fake-code:ok", state })).searchParams.get("spotify"),
  ).toBe("connected");
  // Single use.
  expect(
    (await call({ code: "fake-code:ok", state })).searchParams.get("spotify"),
  ).toBe("error");

  const expired = await startSpotify(api);
  await db.update(oauthStates).set({ expiresAt: new Date(Date.now() - 1000) });
  expect(
    (
      await call({ code: "fake-code:ok", state: expired.state })
    ).searchParams.get("spotify"),
  ).toBe("error");

  // An unexchangeable code is an error and does not connect.
  await api.delete("/integrations/spotify");
  const s2 = await startSpotify(api);
  expect(
    (await call({ code: "garbage", state: s2.state })).searchParams.get(
      "spotify",
    ),
  ).toBe("error");
  expect(
    (await (await api.get("/integrations/spotify")).json()).connected,
  ).toBe(false);

  // User denial keeps the return path and reports an error.
  const s3 = await startSpotify(api, "/library");
  const denied = await call({ error: "access_denied", state: s3.state });
  expect(denied.pathname).toBe("/library");
  expect(denied.searchParams.get("spotify")).toBe("error");

  // Off-site redirectTo values fall back to "/".
  const s4 = await startSpotify(api, "//evil.example/x");
  const fallback = await call({ code: "fake-code:ok", state: s4.state });
  expect(fallback.origin).toBe(WEB_URL);
  expect(fallback.pathname).toBe("/");
  await anon.dispose();
  await api.dispose();
});

test("import without a connection is 409 SPOTIFY_LOGIN_REQUIRED", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const res = await api.post(`${base}/import`, { data: { url: PLAYLIST } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: "SPOTIFY_LOGIN_REQUIRED" });
  await api.dispose();
});

test("import with a connection reads the seeded playlist; private is 403 for another account, readable by its owner", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  await connectSpotify(api);
  const start = await api.post(`${base}/import`, { data: { url: PLAYLIST } });
  expect(start.status()).toBe(202);
  const { importId } = await start.json();
  await expect
    .poll(
      async () =>
        (await (await api.get(`${base}/imports/${importId}`)).json()).status,
      { timeout: 20_000 },
    )
    .toBe("completed");
  expect(
    await (await api.get(`${base}/imports/${importId}`)).json(),
  ).toMatchObject({ total: 3, added: 3 });

  const priv = await api.post(`${base}/import`, {
    data: { url: "https://open.spotify.com/playlist/fakePlaylistPrivate" },
  });
  expect(priv.status()).toBe(403);
  expect(await priv.json()).toMatchObject({ code: "PLAYLIST_FORBIDDEN" });

  const missing = await api.post(`${base}/import`, {
    data: { url: "https://open.spotify.com/playlist/nope" },
  });
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({
    code: "PLAYLIST_NOT_FOUND_OR_PRIVATE",
  });

  // Linking the owning Spotify account makes the private playlist readable.
  await connectSpotify(api, "owner");
  const own = await api.post(`${base}/import`, {
    data: { url: "https://open.spotify.com/playlist/fakePlaylistPrivate" },
  });
  expect(own.status()).toBe(202);
  await api.dispose();
});

test("an expired access token is refreshed transparently", async ({
  testApi,
  db,
}) => {
  const { user, api, base } = await bandWithClient(testApi);
  await connectSpotify(api);
  const [before] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, user.id));
  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  const res = await api.post(`${base}/import`, { data: { url: PLAYLIST } });
  expect(res.status()).toBe(202);
  const [after] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, user.id));
  expect(after!.accessTokenEncrypted).not.toBe(before!.accessTokenEncrypted);
  expect(after!.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  await api.dispose();
});

test("invalid-grant on refresh removes the connection and returns 409", async ({
  testApi,
  db,
}) => {
  const { user, api, base } = await bandWithClient(testApi);
  await connectSpotify(api);
  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  await testApi.revokeSpotifyRefreshTokens();

  const res = await api.post(`${base}/import`, { data: { url: PLAYLIST } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: "SPOTIFY_LOGIN_REQUIRED" });
  expect(
    await db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, user.id)),
  ).toHaveLength(0);
  expect(
    (await (await api.get("/integrations/spotify")).json()).connected,
  ).toBe(false);
  await api.dispose();
});
