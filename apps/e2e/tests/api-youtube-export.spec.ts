import type { BandSeedResult } from "@greenroom/db";
import { BANDS, SONGS, USERS, oauthConnections } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { apiAs } from "./library-helpers.js";
import { connectYoutube } from "./youtube-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const BAND = BANDS.nightOwls.id;
const LIBRARY = `/bands/${BAND}/songs/export/youtube`;

let seed: BandSeedResult;
test.beforeEach(async ({ testApi }) => {
  seed = await testApi.seed("band");
});

async function gigSetlist(api: APIRequestContext, gigId: string) {
  const res = await api.get(`/bands/${BAND}/gigs/${gigId}/setlist`);
  return ((await res.json()) as { id: string }).id;
}

test("export without a connection needs a YouTube login and creates nothing", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: "YOUTUBE_LOGIN_REQUIRED" });
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);
  await api.dispose();
});

test("a connection missing the youtube scope asks to connect again", async ({
  testApi,
  db,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  await db
    .update(oauthConnections)
    .set({ scopes: ["openid", "email"] })
    .where(eq(oauthConnections.userId, USERS.ava.id));
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: "YOUTUBE_LOGIN_REQUIRED" });
  await api.dispose();
});

test("library export creates one private playlist and reports skipped songs", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  const res = await api.post(LIBRARY, {
    data: { name: "Night Owls library", sort: "title" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    name: "Night Owls library",
    exported: 3,
    leftOut: 0,
  });
  expect(body.playlistUrl).toBe(
    `https://www.youtube.com/playlist?list=${body.playlistId}`,
  );
  expect(body.skipped.map((s: { title: string }) => s.title)).toEqual([
    "Jam in A",
    "Low Tide",
    "Original One",
    "Paper Planes",
    "Skyline Drive",
  ]);

  const playlists = await testApi.youtubeCreatedPlaylists();
  expect(playlists).toHaveLength(1);
  expect(playlists[0]).toMatchObject({
    id: body.playlistId,
    name: "Night Owls library",
    isPublic: false,
  });
  // Sorted by title: Harbor Lights, Midnight Train, Red Line.
  expect(playlists[0]!.videoIds).toEqual([
    "harborLights",
    "midnightTrain",
    "redLine",
  ]);
  await api.dispose();
});

test("setlist export follows setlist order and skips songs without a YouTube link", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  const put = await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: {
      songIds: [
        SONGS.redLine.id,
        SONGS.skyline.id,
        SONGS.harborLights.id,
        SONGS.midnightTrain.id,
      ],
    },
  });
  expect(put.ok()).toBe(true);

  const res = await api.post(`/bands/${BAND}/setlists/${slId}/export/youtube`, {
    data: { name: "Club setlist" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.exported).toBe(3);
  expect(body.skipped).toEqual([
    { songId: SONGS.skyline.id, title: "Skyline Drive" },
  ]);
  const [playlist] = await testApi.youtubeCreatedPlaylists();
  expect(playlist!.videoIds).toEqual([
    "redLine",
    "harborLights",
    "midnightTrain",
  ]);
  await api.dispose();
});

test("a song with only a YouTube Music reference is exported", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  await api.post(`/bands/${BAND}/songs`, {
    data: {
      title: "Music Only",
      references: [
        {
          label: "YouTube Music",
          value: "https://music.youtube.com/watch?v=musicOnly01&si=abc",
        },
      ],
    },
  });
  const res = await api.post(LIBRARY, { data: { name: "With music" } });
  expect((await res.json()).exported).toBe(4);
  const [playlist] = await testApi.youtubeCreatedPlaylists();
  expect(playlist!.videoIds).toContain("musicOnly01");
  await api.dispose();
});

test("videos YouTube refuses are reported as skipped", async ({ testApi }) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  await testApi.setYoutubeUnavailableVideos(["redLine"]);
  const res = await api.post(LIBRARY, {
    data: { name: "Library", sort: "title" },
  });
  const body = await res.json();
  expect(body.exported).toBe(2);
  expect(body.skipped.map((s: { title: string }) => s.title)).toContain(
    "Red Line",
  );
  await api.dispose();
});

test("quota exhaustion answers 503 YOUTUBE_QUOTA_EXCEEDED and the connection survives", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  await testApi.setYoutubeQuotaExceeded(true);
  const res = await api.post(LIBRARY, { data: { name: "Library" } });
  expect(res.status()).toBe(503);
  expect(await res.json()).toMatchObject({ code: "YOUTUBE_QUOTA_EXCEEDED" });
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);
  expect(
    (await (await api.get("/integrations/youtube")).json()).connected,
  ).toBe(true);

  await testApi.setYoutubeQuotaExceeded(false);
  expect(
    (await api.post(LIBRARY, { data: { name: "Library" } })).status(),
  ).toBe(200);
  await api.dispose();
});

test("nothing to export answers 422 and creates no playlist", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  const exportIt = () =>
    api.post(`/bands/${BAND}/setlists/${slId}/export/youtube`, {
      data: { name: "Nope" },
    });

  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [SONGS.skyline.id] },
  });
  const onlySpotify = await exportIt();
  expect(onlySpotify.status()).toBe(422);
  expect((await onlySpotify.json()).code).toBe("NOTHING_TO_EXPORT");

  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [] },
  });
  expect((await exportIt()).status()).toBe(422);
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);
  await api.dispose();
});

test("export validates the name and requires band membership", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  const blank = await api.post(LIBRARY, { data: { name: "  " } });
  expect(blank.status()).toBe(400);

  const outsider = await apiAs(testApi, "stranger@example.com");
  const res = await outsider.post(LIBRARY, { data: { name: "Hi" } });
  expect([403, 404]).toContain(res.status());
  await api.dispose();
  await outsider.dispose();
});

test("a song with only a hand-added YouTube reference is exported and exposes its link", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  await connectYoutube(api);
  const link = "https://youtu.be/refOnly0001";
  const created = await api.post(`/bands/${BAND}/songs`, {
    data: {
      title: "Reference Only",
      references: [{ label: "youtube", value: link }],
    },
  });
  expect(created.status()).toBe(201);
  const song = await created.json();
  expect(song.youtubeUrl).toBe(link);

  // The library list carries the derived link the web queue reads.
  const list = await (await api.get(`/bands/${BAND}/songs`)).json();
  expect(list.find((s: { id: string }) => s.id === song.id).youtubeUrl).toBe(
    link,
  );

  const res = await api.post(LIBRARY, { data: { name: "With reference" } });
  expect((await res.json()).exported).toBe(4);
  const [playlist] = await testApi.youtubeCreatedPlaylists();
  expect(playlist!.videoIds).toContain("refOnly0001");

  const slId = await gigSetlist(api, seed.gigs.upcomingClub.id);
  await api.put(`/bands/${BAND}/setlists/${slId}/items`, {
    data: { songIds: [song.id] },
  });
  const detail = await (
    await api.get(`/bands/${BAND}/setlists/${slId}`)
  ).json();
  expect(detail.items[0].youtubeUrl).toBe(link);
  const viaSetlist = await api.post(
    `/bands/${BAND}/setlists/${slId}/export/youtube`,
    { data: { name: "Setlist" } },
  );
  expect((await viaSetlist.json()).exported).toBe(1);
  await api.dispose();
});
