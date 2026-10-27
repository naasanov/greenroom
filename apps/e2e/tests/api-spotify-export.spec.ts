import type { BandSeedResult } from "@greenroom/db";
import { BANDS, SONGS, USERS, oauthConnections } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { apiAs } from "./library-helpers.js";
import { startSpotify } from "./spotify-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const BAND = BANDS.nightOwls.id;
const LIBRARY = `/bands/${BAND}/songs/export`;

let seed: BandSeedResult;
test.beforeEach(async ({ testApi }) => {
  seed = await testApi.seed("band");
});

/** Runs the fake connect flow, optionally asking for the export scopes. */
async function connect(api: APIRequestContext, scopes?: "export") {
  const res = await api.get("/integrations/spotify/start", {
    params: { redirectTo: "/library", ...(scopes ? { scopes } : {}) },
    maxRedirects: 0,
  });
  const state = new URL(res.headers()["location"]!).searchParams.get("state");
  const cb = await api.get("/integrations/spotify/callback", {
    params: { code: "fake-code:tester", state: state! },
    maxRedirects: 0,
  });
  expect(cb.headers()["location"]).toContain("spotify=connected");
}

async function gigSetlist(api: APIRequestContext, gigId: string) {
  const res = await api.get(`/bands/${BAND}/gigs/${gigId}/setlist`);
  return ((await res.json()) as { id: string }).id;
}

test("start with scopes=export requests the modify scopes", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const res = await api.get("/integrations/spotify/start", {
    params: { scopes: "export" },
    maxRedirects: 0,
  });
  const scope = new URL(res.headers()["location"]!).searchParams.get("scope");
  expect(scope?.split(" ")).toEqual(
    expect.arrayContaining([
      "playlist-read-private",
      "playlist-modify-private",
      "playlist-modify-public",
    ]),
  );
  const plain = await startSpotify(api);
  expect(plain.location.searchParams.get("scope")).not.toContain("modify");
  await api.dispose();
});

test("export without a connection needs an export login", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({
    code: "SPOTIFY_LOGIN_REQUIRED",
    scopes: "export",
  });
  expect(await testApi.spotifyCreatedPlaylists()).toEqual([]);
  await api.dispose();
});

test("a read-only connection is asked to upgrade, then export works", async ({
  testApi,
  db,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(409);
  expect((await res.json()).scopes).toBe("export");

  await connect(api, "export");
  const [row] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.userId, USERS.ava.id));
  expect(row?.scopes).toContain("playlist-modify-private");
  const ok = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(ok.status()).toBe(200);
  await api.dispose();
});

test("library export creates a private playlist and reports skipped songs", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api, "export");
  const res = await api.post(LIBRARY, {
    data: { name: "Night Owls library", sort: "title" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ name: "Night Owls library", exported: 3 });
  expect(body.playlistUrl).toBe(
    `https://open.spotify.com/playlist/${body.playlistId}`,
  );
  expect(body.skipped.map((s: { title: string }) => s.title)).toEqual([
    "Harbor Lights",
    "Jam in A",
    "Midnight Train",
    "Original One",
    "Red Line",
  ]);

  const [playlist] = await testApi.spotifyCreatedPlaylists();
  expect(playlist).toMatchObject({
    id: body.playlistId,
    name: "Night Owls library",
    isPublic: false,
  });
  // Sorted by title: Low Tide, Paper Planes, Skyline Drive.
  expect(playlist!.trackIds).toEqual([
    "spotify-track-lowTide",
    "spotify-track-paperPlanes",
    "spotify-track-skyline",
  ]);
  await api.dispose();
});

test("setlist export follows setlist order and skips songs without a track", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api, "export");
  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  const put = await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: {
      songIds: [
        SONGS.skyline.id,
        SONGS.midnightTrain.id,
        SONGS.lowTide.id,
        SONGS.paperPlanes.id,
      ],
    },
  });
  expect(put.ok()).toBe(true);

  const res = await api.post(`/bands/${BAND}/setlists/${slId}/export`, {
    data: { name: "Club setlist" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.exported).toBe(3);
  expect(body.skipped).toEqual([
    { songId: SONGS.midnightTrain.id, title: "Midnight Train" },
  ]);
  const [playlist] = await testApi.spotifyCreatedPlaylists();
  expect(playlist!.trackIds).toEqual([
    "spotify-track-skyline",
    "spotify-track-lowTide",
    "spotify-track-paperPlanes",
  ]);
  await api.dispose();
});

test("nothing to export answers 422 and creates no playlist", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api, "export");
  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  const exportIt = () =>
    api.post(`/bands/${BAND}/setlists/${slId}/export`, {
      data: { name: "Nope" },
    });

  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [SONGS.redLine.id] },
  });
  const onlyManual = await exportIt();
  expect(onlyManual.status()).toBe(422);
  expect((await onlyManual.json()).code).toBe("NOTHING_TO_EXPORT");

  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [] },
  });
  expect((await exportIt()).status()).toBe(422);
  expect(await testApi.spotifyCreatedPlaylists()).toEqual([]);
  await api.dispose();
});

test("export validates the name and requires band membership", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api, "export");
  const blank = await api.post(LIBRARY, { data: { name: "  " } });
  expect(blank.status()).toBe(400);

  const outsider = await apiAs(testApi, "stranger@example.com");
  const res = await outsider.post(LIBRARY, { data: { name: "Hi" } });
  expect([403, 404]).toContain(res.status());
  await api.dispose();
  await outsider.dispose();
});
