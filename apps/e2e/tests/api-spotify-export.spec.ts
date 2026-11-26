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

/** Runs the fake connect flow. */
async function connect(api: APIRequestContext) {
  const res = await api.get("/integrations/spotify/start", {
    params: { redirectTo: "/library" },
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

test("a plain connect already requests the modify scopes", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const plain = await startSpotify(api);
  expect(plain.location.searchParams.get("scope")?.split(" ")).toEqual(
    expect.arrayContaining([
      "playlist-read-private",
      "playlist-read-collaborative",
      "playlist-modify-private",
      "playlist-modify-public",
    ]),
  );
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

test("a fresh connect exports without asking again", async ({ testApi }) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  const ok = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(ok.status()).toBe(200);
  await api.dispose();
});

test("a legacy read-only link is asked to reconnect once, then export works", async ({
  testApi,
  db,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  await db
    .update(oauthConnections)
    .set({ scopes: ["playlist-read-private", "playlist-read-collaborative"] })
    .where(eq(oauthConnections.userId, USERS.ava.id));
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({
    code: "SPOTIFY_RECONNECT_REQUIRED",
    message: "Reconnect Spotify to grant playlist access",
  });

  await connect(api);
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
  await connect(api);
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
  await connect(api);
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
  await connect(api);
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
  await connect(api);
  const blank = await api.post(LIBRARY, { data: { name: "  " } });
  expect(blank.status()).toBe(400);

  const outsider = await apiAs(testApi, "stranger@example.com");
  const res = await outsider.post(LIBRARY, { data: { name: "Hi" } });
  expect([403, 404]).toContain(res.status());
  await api.dispose();
  await outsider.dispose();
});

test("a song with only a hand-added Spotify reference is exported", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  const created = await api.post(`/bands/${BAND}/songs`, {
    data: {
      title: "Reference Only",
      references: [
        {
          label: "spotify",
          value: "https://open.spotify.com/intl-de/track/fakeTrack1?si=abc",
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const song = await created.json();
  expect(song).toMatchObject({ spotifyTrackId: "fakeTrack1" });

  const res = await api.post(LIBRARY, { data: { name: "With reference" } });
  expect((await res.json()).exported).toBe(4);
  const [playlist] = await testApi.spotifyCreatedPlaylists();
  expect(playlist!.trackIds).toContain("fakeTrack1");

  // The same song is exported from a setlist.
  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [song.id] },
  });
  const items = await (await api.get(`/bands/${BAND}/setlists/${slId}`)).json();
  expect(items.items[0]).toMatchObject({ spotifyTrackId: "fakeTrack1" });
  const viaSetlist = await api.post(`/bands/${BAND}/setlists/${slId}/export`, {
    data: { name: "Setlist" },
  });
  expect((await viaSetlist.json()).exported).toBe(1);
  const created2 = await testApi.spotifyCreatedPlaylists();
  expect(created2[1]!.trackIds).toEqual(["fakeTrack1"]);
  await api.dispose();
});

test("a Spotify reference wins over the stored column, and an unresolved short link has no id", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  const base = `/bands/${BAND}/songs`;
  const viaColumn = await (
    await api.post(base, {
      data: { title: "Column", spotifyTrackId: "fakeTrack2" },
    })
  ).json();
  expect(viaColumn.spotifyTrackId).toBe("fakeTrack2");

  // A reference replaces the fallback, even when it carries no parseable id.
  const patched = await api.patch(`${base}/${viaColumn.id}`, {
    data: {
      references: [
        { label: "Spotify", value: "https://spotify.link/noSuchOne" },
      ],
    },
  });
  const body = await patched.json();
  expect(body.spotifyTrackId).toBeNull();
  expect(body.references[0].value).toBe("https://spotify.link/noSuchOne");

  const res = await api.post(`${base}/export`, { data: { name: "Library" } });
  const exported = await res.json();
  expect(exported.skipped.map((s: { songId: string }) => s.songId)).toContain(
    viaColumn.id,
  );
  await api.dispose();
});

test("a spotify.link reference is saved as the canonical track link", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connect(api);
  const base = `/bands/${BAND}/songs`;
  const created = await (
    await api.post(base, {
      data: {
        title: "Short",
        references: [
          { label: "Spotify", value: "https://spotify.link/fakeTrack2" },
        ],
      },
    })
  ).json();
  expect(created.spotifyTrackId).toBe("fakeTrack2");
  expect(created.references[0].value).toBe(
    "https://open.spotify.com/track/fakeTrack2",
  );

  // Editing an existing song resolves it the same way.
  const other = await (
    await api.post(base, { data: { title: "Later" } })
  ).json();
  const patched = await (
    await api.patch(`${base}/${other.id}`, {
      data: {
        references: [
          { label: "Spotify", value: "https://spotify.link/fakeTrack3" },
        ],
      },
    })
  ).json();
  expect(patched.spotifyTrackId).toBe("fakeTrack3");
  expect(patched.references[0].value).toBe(
    "https://open.spotify.com/track/fakeTrack3",
  );

  const res = await api.post(`${base}/export`, { data: { name: "Library" } });
  expect((await res.json()).exported).toBe(5);
  const [playlist] = await testApi.spotifyCreatedPlaylists();
  expect(playlist!.trackIds).toEqual(
    expect.arrayContaining(["fakeTrack2", "fakeTrack3"]),
  );
  await api.dispose();
});
