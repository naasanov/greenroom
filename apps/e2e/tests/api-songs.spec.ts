import {
  gigSetlists,
  gigs,
  setlistItems,
  setlists,
  songLinks,
  type Database,
} from "@greenroom/db";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import { connectSpotify } from "./spotify-helpers.js";
import { connectYoutube } from "./youtube-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

/** A band with one admin client. */
async function bandWithClient(testApi: TestApi, email = "a@example.com") {
  const c = await client(testApi, email);
  const band = await (
    await c.api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  return { ...c, bandId: band.id as string, base: `/bands/${band.id}/songs` };
}

interface Created {
  id: string;
  title: string;
}

async function addSong(
  api: APIRequestContext,
  base: string,
  data: Record<string, unknown>,
): Promise<Created> {
  const res = await api.post(base, { data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

/** Puts songs on a new setlist; optionally attaches it to a new gig. */
async function setlistFor(
  db: Database,
  bandId: string,
  songIds: string[],
  gig?: { title: string; date: string },
) {
  const [sl] = await db.insert(setlists).values({ bandId }).returning();
  await db.insert(setlistItems).values(
    songIds.map((songId, position) => ({
      setlistId: sl!.id,
      songId,
      position,
    })),
  );
  if (gig) {
    const [g] = await db
      .insert(gigs)
      .values({ bandId, title: gig.title, date: gig.date })
      .returning();
    await db
      .insert(gigSetlists)
      .values({ bandId, gigId: g!.id, setlistId: sl!.id });
    return { setlistId: sl!.id, gigId: g!.id };
  }
  return { setlistId: sl!.id, gigId: null };
}

test("CRUD with ordered references and soft delete", async ({ testApi }) => {
  const { api, base } = await bandWithClient(testApi);
  const created = await addSong(api, base, {
    title: "  Sweet Home  ",
    artist: "Band X",
    durationSeconds: 215,
    notes: "Capo 2",
    references: [
      { label: "Key", value: "F# minor, 105 bpm" },
      { label: "Lyrics", value: "https://example.com/lyrics" },
      { label: "Chart", value: "https://example.com/chart" },
    ],
  });

  const got = await (await api.get(`${base}/${created.id}`)).json();
  expect(got).toMatchObject({
    title: "Sweet Home",
    artist: "Band X",
    durationSeconds: 215,
    notes: "Capo 2",
    setlistCount: 0,
    usedIn: [],
  });
  expect(got.references.map((r: { label: string }) => r.label)).toEqual([
    "Key",
    "Lyrics",
    "Chart",
  ]);

  // Replacing the list reorders and drops rows.
  const patched = await api.patch(`${base}/${created.id}`, {
    data: {
      title: "Sweet Home 2",
      artist: "",
      references: [
        { label: "Chart", value: "https://example.com/chart" },
        { label: "Key", value: "E minor" },
      ],
    },
  });
  expect(patched.status()).toBe(200);
  const after = await patched.json();
  expect(after).toMatchObject({
    title: "Sweet Home 2",
    artist: null,
    durationSeconds: 215,
  });
  expect(
    after.references.map((r: { label: string; value: string }) => [
      r.label,
      r.value,
    ]),
  ).toEqual([
    ["Chart", "https://example.com/chart"],
    ["Key", "E minor"],
  ]);

  // Omitting references leaves them alone; an empty list clears them.
  const keep = await (
    await api.patch(`${base}/${created.id}`, { data: { notes: null } })
  ).json();
  expect(keep.notes).toBeNull();
  expect(keep.references).toHaveLength(2);
  const cleared = await (
    await api.patch(`${base}/${created.id}`, { data: { references: [] } })
  ).json();
  expect(cleared.references).toEqual([]);

  expect((await api.post(base, { data: { title: " " } })).status()).toBe(400);
  expect(
    (
      await api.patch(`${base}/${created.id}`, { data: { title: "" } })
    ).status(),
  ).toBe(400);

  const del = await api.delete(`${base}/${created.id}`);
  expect(del.status()).toBe(200);
  expect(await del.json()).toEqual({ id: created.id, setlistCount: 0 });
  expect((await api.get(`${base}/${created.id}`)).status()).toBe(404);
  expect(await (await api.get(base)).json()).toEqual([]);
  expect((await api.delete(`${base}/${created.id}`)).status()).toBe(404);
  expect((await api.get(`${base}/not-a-uuid`)).status()).toBe(404);
  await api.dispose();
});

test("access: anonymous 401, non-member 404, any member can write", async ({
  testApi,
}) => {
  const { api, base, bandId } = await bandWithClient(testApi);
  const song = await addSong(api, base, { title: "Private Song" });

  const anonymous = await pwRequest.newContext({ baseURL: API_URL });
  expect((await anonymous.get(base)).status()).toBe(401);

  const outsider = await client(testApi, "outsider@example.com");
  for (const [method, path] of [
    ["get", base],
    ["post", base],
    ["get", `${base}/${song.id}`],
    ["patch", `${base}/${song.id}`],
    ["delete", `${base}/${song.id}`],
    ["post", `${base}/resolve`],
    ["post", `${base}/import`],
  ] as const) {
    const res = await outsider.api[method](path, { data: {} });
    expect(res.status(), `${method} ${path}`).toBe(404);
  }

  // A plain member joins through the invite link and can edit.
  const invite = await (await api.get(`/bands/${bandId}/invite`)).json();
  const member = await client(testApi, "member@example.com");
  expect(
    (await member.api.post(`/invites/${invite.token}/accept`)).status(),
  ).toBe(200);
  const edited = await member.api.patch(`${base}/${song.id}`, {
    data: { notes: "member edit" },
  });
  expect(edited.status()).toBe(200);
  expect((await member.api.delete(`${base}/${song.id}`)).status()).toBe(200);
  await api.dispose();
});

test("search and sorts", async ({ testApi, db }) => {
  const { api, base, bandId } = await bandWithClient(testApi);
  const a = await addSong(api, base, { title: "alpha", artist: "Zed" });
  const b = await addSong(api, base, { title: "Bravo", artist: "Amy" });
  const c = await addSong(api, base, { title: "Charlie" });
  const titles = async (qs: string) =>
    (await (await api.get(`${base}${qs}`)).json()).map(
      (s: { title: string }) => s.title,
    );

  expect(await titles("")).toEqual(["Charlie", "Bravo", "alpha"]);
  expect(await titles("?sort=recent")).toEqual(["Charlie", "Bravo", "alpha"]);
  expect(await titles("?sort=title")).toEqual(["alpha", "Bravo", "Charlie"]);
  expect(await titles("?sort=artist")).toEqual(["Bravo", "alpha", "Charlie"]);

  expect(await titles("?q=BRAV")).toEqual(["Bravo"]);
  expect(await titles("?q=zed")).toEqual(["alpha"]);
  expect(await titles("?q=%25")).toEqual([]);
  expect(await titles("?q=a&sort=title")).toEqual([
    "alpha",
    "Bravo",
    "Charlie",
  ]);
  expect((await api.get(`${base}?sort=bogus`)).status()).toBe(400);

  // alpha: one past gig. Bravo: a past gig plus an unattached setlist.
  // Charlie: only a future gig, which does not count as played.
  await setlistFor(db, bandId, [a.id, b.id], {
    title: "Old gig",
    date: "2020-01-01",
  });
  await setlistFor(db, bandId, [b.id], {
    title: "Newer gig",
    date: "2021-05-05",
  });
  await setlistFor(db, bandId, [b.id]);
  await setlistFor(db, bandId, [c.id], {
    title: "Future gig",
    date: "2999-01-01",
  });

  expect(await titles("?sort=lastPlayed")).toEqual([
    "Bravo",
    "alpha",
    "Charlie",
  ]);
  expect(await titles("?sort=mostPlayed")).toEqual([
    "Bravo",
    "alpha",
    "Charlie",
  ]);

  const list = await (await api.get(`${base}?sort=mostPlayed`)).json();
  expect(
    list.map(
      (s: {
        title: string;
        setlistCount: number;
        lastPlayedDate: string | null;
      }) => [s.title, s.setlistCount, s.lastPlayedDate],
    ),
  ).toEqual([
    ["Bravo", 3, "2021-05-05"],
    ["alpha", 1, "2020-01-01"],
    ["Charlie", 1, null],
  ]);
  await api.dispose();
});

test("used-in lists gigs and the delete response carries the setlist count", async ({
  testApi,
  db,
}) => {
  const { api, base, bandId } = await bandWithClient(testApi);
  const song = await addSong(api, base, { title: "Shared Song" });
  const other = await addSong(api, base, { title: "Other Song" });
  const g1 = await setlistFor(db, bandId, [song.id, other.id], {
    title: "Club night",
    date: "2026-03-01",
  });
  const g2 = await setlistFor(db, bandId, [song.id], {
    title: "Festival",
    date: "2026-07-04",
  });
  await setlistFor(db, bandId, [song.id]);

  const detail = await (await api.get(`${base}/${song.id}`)).json();
  expect(detail.setlistCount).toBe(3);
  expect(detail.usedIn).toEqual([
    {
      kind: "gig",
      setlistId: g2.setlistId,
      gigId: g2.gigId,
      title: "Festival",
      date: "2026-07-04",
    },
    {
      kind: "gig",
      setlistId: g1.setlistId,
      gigId: g1.gigId,
      title: "Club night",
      date: "2026-03-01",
    },
  ]);

  const del = await (await api.delete(`${base}/${song.id}`)).json();
  expect(del).toEqual({ id: song.id, setlistCount: 3 });
  const rest = await (await api.get(base)).json();
  expect(rest.map((s: { id: string }) => s.id)).toEqual([other.id]);
  await api.dispose();
});

test("duplicate detection returns 409 unless forced", async ({ testApi }) => {
  const { api, base } = await bandWithClient(testApi);
  const first = await addSong(api, base, {
    title: "Mr. Brightside",
    artist: "The Killers",
    spotifyTrackId: "fakeTrack1",
  });

  // Same Spotify track id, different text.
  const bySpotify = await api.post(base, {
    data: { title: "Something else", spotifyTrackId: "fakeTrack1" },
  });
  expect(bySpotify.status()).toBe(409);
  expect(await bySpotify.json()).toMatchObject({
    code: "DUPLICATE_SONG",
    songId: first.id,
  });

  // Same title and artist after normalization.
  const byText = await api.post(base, {
    data: { title: "mr brightside", artist: "THE KILLERS" },
  });
  expect(byText.status()).toBe(409);
  expect(await byText.json()).toMatchObject({
    code: "DUPLICATE_SONG",
    songId: first.id,
  });

  // A different artist is a different song.
  await addSong(api, base, { title: "Mr. Brightside", artist: "Cover Band" });

  const forced = await api.post(base, {
    data: { title: "Mr. Brightside", artist: "The Killers", force: true },
  });
  expect(forced.status()).toBe(201);
  expect(await (await api.get(base)).json()).toHaveLength(3);

  // Another band's library is separate, and deleted songs do not block.
  const other = await bandWithClient(testApi, "b@example.com");
  await addSong(other.api, other.base, {
    title: "Mr. Brightside",
    artist: "The Killers",
  });
  const fresh = await addSong(api, base, { title: "Unique", artist: "Me" });
  await api.delete(`${base}/${fresh.id}`);
  await addSong(api, base, { title: "Unique", artist: "Me" });
  await api.dispose();
  await other.api.dispose();
});

test("smart add resolves links, searches Spotify, and handles empty results", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const resolve = async (input: string) => {
    const res = await api.post(`${base}/resolve`, { data: { input } });
    expect(res.status()).toBe(200);
    return res.json();
  };

  const track = await resolve("https://open.spotify.com/track/fakeTrack2?si=x");
  expect(track.kind).toBe("spotify-link");
  expect(track.candidates).toEqual([
    {
      source: "spotify",
      title: "Seven Nation Army",
      artist: "The White Stripes",
      durationSeconds: 232,
      imageUrl: "https://fake-spotify.test/art/fakeTrack2.jpg",
      spotifyTrackId: "fakeTrack2",
      youtubeUrl: null,
      references: [
        {
          label: "Spotify",
          value: "https://open.spotify.com/track/fakeTrack2",
        },
      ],
      existingSongId: null,
    },
  ]);

  const video = await resolve("https://youtu.be/fakeVid0001");
  expect(video.kind).toBe("youtube-link");
  expect(video.candidates).toHaveLength(1);
  expect(video.candidates[0]).toMatchObject({
    source: "youtube",
    title: "Fake Band - Live at the Garage",
    artist: "Fake Band",
    durationSeconds: 215,
    imageUrl: "https://fake-youtube.test/thumb/fakeVid0001.jpg",
    spotifyTrackId: null,
    youtubeUrl: "https://www.youtube.com/watch?v=fakeVid0001",
    references: [
      {
        label: "YouTube",
        value: "https://www.youtube.com/watch?v=fakeVid0001",
      },
    ],
  });

  const search = await resolve("the killers");
  expect(search.kind).toBe("search");
  expect(search.candidates.map((c: { title: string }) => c.title)).toEqual([
    "Mr. Brightside",
  ]);
  expect(search.candidates[0].spotifyTrackId).toBe("fakeTrack1");

  // Unknown links, unknown ids, and no-match searches are empty, not errors.
  for (const input of [
    "zzzz no such song",
    "https://open.spotify.com/track/doesNotExist",
    "https://youtu.be/unknownVid99",
    "https://example.com/not-music",
  ]) {
    expect((await resolve(input)).candidates, input).toEqual([]);
  }
  expect(
    (await resolve("https://open.spotify.com/playlist/fakePlaylistPublic"))
      .kind,
  ).toBe("playlist");
  expect(
    (await api.post(`${base}/resolve`, { data: { input: "  " } })).status(),
  ).toBe(400);

  // Candidates flag songs already in the library.
  const saved = await addSong(api, base, {
    title: "Seven Nation Army",
    artist: "The White Stripes",
    spotifyTrackId: "fakeTrack2",
  });
  const again = await resolve("https://open.spotify.com/track/fakeTrack2");
  expect(again.candidates[0].existingSongId).toBe(saved.id);
  await api.dispose();
});

test("YouTube links fill the duration on create and on link edit when empty", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;

  const created = await (
    await api.post(base, {
      data: { title: "Live", youtubeUrl: yt("fakeVid0001") },
    })
  ).json();
  expect(created.durationSeconds).toBe(215);

  // Hours are counted; an explicit duration is never overwritten.
  const long = await (
    await api.post(base, {
      data: { title: "Long", youtubeUrl: yt("fakeVid0002") },
    })
  ).json();
  expect(long.durationSeconds).toBe(3725);
  const explicit = await (
    await api.post(base, {
      data: {
        title: "Set",
        youtubeUrl: yt("fakeVid0001"),
        durationSeconds: 99,
      },
    })
  ).json();
  expect(explicit.durationSeconds).toBe(99);

  // Unknown videos leave the duration blank.
  const unknown = await (
    await api.post(base, {
      data: { title: "Gone", youtubeUrl: yt("noSuchVid99") },
    })
  ).json();
  expect(unknown.durationSeconds).toBeNull();

  // Editing the link backfills only an empty duration.
  const patched = await (
    await api.patch(`${base}/${unknown.id}`, {
      data: { youtubeUrl: yt("fakeVid0002") },
    })
  ).json();
  expect(patched.durationSeconds).toBe(3725);
  const kept = await (
    await api.patch(`${base}/${patched.id}`, {
      data: { youtubeUrl: yt("fakeVid0001") },
    })
  ).json();
  expect(kept.durationSeconds).toBe(3725);
});

test("suggest-references returns whitelisted links, never saved", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const source = "https://open.spotify.com/track/abc";
  await testApi.seedMusicLink(source, {
    apple_music: "https://music.apple.com/x",
    youtube_music: "https://music.youtube.com/watch?v=x",
    tidal: "https://tidal.com/x",
    deezer: "https://deezer.com/x",
  });
  const hit = await api.post(`${base}/suggest-references`, {
    data: {
      title: "Mr. Brightside",
      artist: "The Killers",
      sourceUrl: source,
    },
  });
  expect(hit.status()).toBe(200);
  // Whitelist order; tidal and deezer are never returned.
  expect((await hit.json()).suggestions).toEqual([
    {
      key: "youtubeMusic",
      label: "YouTube Music",
      value: "https://music.youtube.com/watch?v=x",
    },
    {
      key: "appleMusic",
      label: "Apple Music",
      value: "https://music.apple.com/x",
    },
  ]);

  // No source link, or an unseeded one (MusicLink's empty result), is no match.
  const miss = await api.post(`${base}/suggest-references`, {
    data: { title: "Totally Original" },
  });
  expect((await miss.json()).suggestions).toEqual([]);
  const empty = await api.post(`${base}/suggest-references`, {
    data: { title: "T", sourceUrl: "https://open.spotify.com/track/none" },
  });
  expect((await empty.json()).suggestions).toEqual([]);

  // Lookup failures are silent: still 200 with no suggestions.
  await testApi.failSuggestions({ musiclink: true });
  const failing = "https://open.spotify.com/track/failing";
  const failed = await api.post(`${base}/suggest-references`, {
    data: { title: "Seven Nation Army", sourceUrl: failing },
  });
  expect(failed.status()).toBe(200);
  expect((await failed.json()).suggestions).toEqual([]);
  expect((await testApi.suggestionCalls()).musiclink).toContain(failing);

  const created = await addSong(api, base, { title: "Mr. Brightside" });
  const stored = await (await api.get(`${base}/${created.id}`)).json();
  expect(stored.references).toEqual([]);
  await api.dispose();
});

test("MusicLink lookups are cached per source URL and never retried", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const ask = (n: number) =>
    api.post(`${base}/suggest-references`, {
      data: { title: "T", sourceUrl: `https://open.spotify.com/track/t${n}` },
    });
  await testApi.seedMusicLink("https://open.spotify.com/track/t0", {
    apple_music: "https://music.apple.com/t0",
  });
  const first = await (await ask(0)).json();
  const again = await (await ask(0)).json();
  expect(again).toEqual(first);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(1);

  // A rate-limited lookup reaches the adapter once; the next one is held back.
  await testApi.failSuggestions({ musiclink: true, retryAfterSeconds: 600 });
  await ask(1);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(2);
  await ask(1);
  await ask(2);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(2);
  await api.dispose();
});

test("a Retry-After from MusicLink pauses further lookups", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const ask = (n: number) =>
    api.post(`${base}/suggest-references`, {
      data: { title: "T", sourceUrl: `https://open.spotify.com/track/r${n}` },
    });
  await testApi.failSuggestions({ musiclink: true, retryAfterSeconds: 600 });
  const limited = await ask(0);
  expect(limited.status()).toBe(200);
  expect((await limited.json()).suggestions).toEqual([]);
  await testApi.failSuggestions({ musiclink: false });
  await testApi.seedMusicLink("https://open.spotify.com/track/r1", {
    apple_music: "https://music.apple.com/r1",
  });
  expect((await (await ask(1)).json()).suggestions).toEqual([]);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(1);
  await api.dispose();
});

test("playlist import runs as a job and reports progress and a summary", async ({
  testApi,
}) => {
  const { api, base, bandId } = await bandWithClient(testApi);
  await connectSpotify(api);
  await addSong(api, base, {
    title: "Mr. Brightside",
    artist: "The Killers",
    spotifyTrackId: "fakeTrack1",
  });

  const start = await api.post(`${base}/import`, {
    data: { url: "https://open.spotify.com/playlist/fakePlaylistPublic?si=1" },
  });
  expect(start.status()).toBe(202);
  const started = await start.json();
  expect(started).toMatchObject({
    playlistName: "Fake Public Setlist",
    total: 3,
  });
  expect(["queued", "running", "completed"]).toContain(started.status);

  const url = `${base}/imports/${started.importId}`;
  await expect
    .poll(async () => (await (await api.get(url)).json()).status, {
      timeout: 20_000,
    })
    .toBe("completed");
  const done = await (await api.get(url)).json();
  expect(done).toMatchObject({
    importId: started.importId,
    playlistName: "Fake Public Setlist",
    total: 3,
    done: 3,
    added: 2,
    skipped: 1,
    failed: 0,
    error: null,
  });

  const songs = await (await api.get(`${base}?sort=title`)).json();
  expect(songs.map((s: { title: string }) => s.title)).toEqual([
    "Mr. Brightside",
    "Seven Nation Army",
    "Take Me Out",
  ]);
  const imported = await (
    await api.get(
      `${base}/${songs.find((s: { title: string }) => s.title === "Take Me Out").id}`,
    )
  ).json();
  expect(imported).toMatchObject({
    artist: "Franz Ferdinand",
    durationSeconds: 237,
    spotifyTrackId: "fakeTrack3",
    imageUrl: "https://fake-spotify.test/art/fakeTrack3.jpg",
  });
  expect(imported.references).toMatchObject([
    { label: "Spotify", value: "https://open.spotify.com/track/fakeTrack3" },
  ]);

  // Importing again skips everything.
  const again = await (
    await api.post(`${base}/import`, {
      data: { url: "spotify:playlist:fakePlaylistPublic" },
    })
  ).json();
  const againUrl = `${base}/imports/${again.importId}`;
  await expect
    .poll(async () => (await (await api.get(againUrl)).json()).status, {
      timeout: 20_000,
    })
    .toBe("completed");
  expect(await (await api.get(againUrl)).json()).toMatchObject({
    total: 3,
    added: 0,
    skipped: 3,
    failed: 0,
  });

  // Private or missing playlists, bad links, and other bands' imports.
  const priv = await api.post(`${base}/import`, {
    data: { url: "https://open.spotify.com/playlist/fakePlaylistPrivate" },
  });
  expect(priv.status()).toBe(403);
  expect(await priv.json()).toMatchObject({
    code: "PLAYLIST_FORBIDDEN",
  });
  expect(
    (
      await api.post(`${base}/import`, {
        data: { url: "https://open.spotify.com/track/fakeTrack1" },
      })
    ).status(),
  ).toBe(400);
  expect((await api.get(`${base}/imports/${randomId()}`)).status()).toBe(404);

  const other = await bandWithClient(testApi, "b@example.com");
  expect(
    (
      await other.api.get(
        `/bands/${other.bandId}/songs/imports/${started.importId}`,
      )
    ).status(),
  ).toBe(404);
  expect(bandId).not.toBe(other.bandId);
  await api.dispose();
  await other.api.dispose();
});

test("Ultimate Guitar is a magic key: UG hosts only, canonical label", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const bad = await api.post(base, {
    data: {
      title: "Bad UG",
      references: [
        { label: "Ultimate Guitar", value: "https://example.com/x" },
      ],
    },
  });
  expect(bad.status()).toBe(400);
  expect(JSON.stringify(await bad.json())).toContain("Ultimate Guitar");

  const ok = await addSong(api, base, {
    title: "Good UG",
    references: [
      {
        label: "ultimate guitar",
        value: "https://tabs.ultimate-guitar.com/tab/x/y-chords-1",
      },
    ],
  });
  const detail = await (await api.get(`${base}/${ok.id}`)).json();
  expect(detail.references.map((r: { label: string }) => r.label)).toEqual([
    "Ultimate Guitar",
  ]);
});

function randomId(): string {
  return "00000000-0000-4000-8000-000000000000";
}

test("magic reference keys: canonical label, provider-host links only", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const bad = await api.post(base, {
    data: {
      title: "Bad Link",
      references: [
        { label: "Chart", value: "https://example.com/c" },
        { label: " spotify ", value: "https://example.com/x" },
      ],
    },
  });
  expect(bad.status()).toBe(400);
  const message = JSON.stringify(await bad.json());
  expect(message).toContain("row 2");
  expect(message).toContain("Spotify");
  expect(await (await api.get(base)).json()).toHaveLength(0);

  const ok = await addSong(api, base, {
    title: "Good Links",
    references: [
      { label: "spotify", value: "https://open.spotify.com/track/abc" },
      { label: "YOUTUBE", value: "https://youtu.be/abc" },
      { label: "apple music", value: "https://music.apple.com/us/song/x" },
      { label: "youtube music", value: "https://music.youtube.com/watch?v=a" },
      { label: "Chart", value: "anything goes" },
    ],
  });
  const detail = await (await api.get(`${base}/${ok.id}`)).json();
  expect(detail.references.map((r: { label: string }) => r.label)).toEqual([
    "Spotify",
    "YouTube",
    "Apple Music",
    "YouTube Music",
    "Chart",
  ]);

  for (const value of [
    "http://open.spotify.com/track/abc",
    "https://open.spotify.com.evil.test/x",
    "not a link",
  ]) {
    const res = await api.patch(`${base}/${ok.id}`, {
      data: { references: [{ label: "Spotify", value }] },
    });
    expect(res.status(), value).toBe(400);
  }
});

test("updates only validate magic rows that changed", async ({
  testApi,
  db,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const song = await addSong(api, base, { title: "Legacy" });
  // A legacy invalid row, written as older code could.
  await db.insert(songLinks).values({
    songId: song.id,
    label: "spotify",
    value: "https://example.com/legacy",
    position: 0,
  });
  const keep = { label: "spotify", value: "https://example.com/legacy" };
  const res = await api.patch(`${base}/${song.id}`, {
    data: {
      references: [keep, { label: "Chart", value: "https://c.example.com" }],
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).references[0].label).toBe("Spotify");

  const edited = await api.patch(`${base}/${song.id}`, {
    data: {
      references: [{ label: "Spotify", value: "https://example.com/legacy2" }],
    },
  });
  expect(edited.status()).toBe(400);
});

test("a song with only a hand-added Spotify reference is found by dedupe and smart add", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const saved = await addSong(api, base, {
    title: "Seven Nation Army",
    artist: "The White Stripes",
    references: [
      {
        label: "spotify",
        value: "https://open.spotify.com/intl-fr/track/fakeTrack2?si=x",
      },
    ],
  });
  const detail = await (await api.get(`${base}/${saved.id}`)).json();
  expect(detail).toMatchObject({ spotifyTrackId: "fakeTrack2" });

  // Same track under other text, by column or by reference, is a duplicate.
  for (const data of [
    { title: "Other title", spotifyTrackId: "fakeTrack2" },
    {
      title: "Another title",
      references: [
        {
          label: "Spotify",
          value: "https://open.spotify.com/track/fakeTrack2",
        },
      ],
    },
  ]) {
    const dup = await api.post(base, { data });
    expect(dup.status()).toBe(409);
    expect(await dup.json()).toMatchObject({
      code: "DUPLICATE_SONG",
      songId: saved.id,
    });
  }

  // A candidate for that track points at the saved song even though titles differ.
  await api.patch(`${base}/${saved.id}`, { data: { title: "Renamed" } });
  const res = await api.post(`${base}/resolve`, {
    data: { input: "https://open.spotify.com/track/fakeTrack2" },
  });
  expect((await res.json()).candidates[0].existingSongId).toBe(saved.id);

  // Removing the reference removes the id: references are the source of truth.
  const cleared = await (
    await api.patch(`${base}/${saved.id}`, { data: { references: [] } })
  ).json();
  expect(cleared.spotifyTrackId).toBeNull();
  await api.dispose();
});

test("the stored columns remain a fallback when a song has no matching reference", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const yt = "https://www.youtube.com/watch?v=fakeVid0001";
  const song = await addSong(api, base, {
    title: "Columns only",
    spotifyTrackId: "fakeTrack4",
    youtubeUrl: yt,
    references: [{ label: "Lyrics", value: "https://lyrics.example.com/x" }],
  });
  const fromList = (await (await api.get(base)).json())[0];
  expect(fromList).toMatchObject({
    spotifyTrackId: "fakeTrack4",
    youtubeUrl: yt,
  });
  expect(await (await api.get(`${base}/${song.id}`)).json()).toMatchObject({
    spotifyTrackId: "fakeTrack4",
    youtubeUrl: yt,
  });

  // A reference takes over from the column once it exists.
  const withRef = await (
    await api.patch(`${base}/${song.id}`, {
      data: {
        references: [
          { label: "YouTube", value: "https://youtu.be/fakeVid0002" },
        ],
      },
    })
  ).json();
  expect(withRef).toMatchObject({
    spotifyTrackId: "fakeTrack4",
    youtubeUrl: "https://youtu.be/fakeVid0002",
  });
  await api.dispose();
});

test("YouTube references fill an empty duration when added or changed", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const ref = (id: string) => [
    { label: "YouTube", value: `https://www.youtube.com/watch?v=${id}` },
  ];

  const created = await (
    await api.post(base, {
      data: { title: "From reference", references: ref("fakeVid0001") },
    })
  ).json();
  expect(created.durationSeconds).toBe(215);

  const explicit = await (
    await api.post(base, {
      data: {
        title: "Explicit",
        durationSeconds: 99,
        references: ref("fakeVid0001"),
      },
    })
  ).json();
  expect(explicit.durationSeconds).toBe(99);

  // Adding the reference later fills only an empty duration.
  const bare = await (await api.post(base, { data: { title: "Bare" } })).json();
  const added = await (
    await api.patch(`${base}/${bare.id}`, {
      data: { references: ref("fakeVid0002") },
    })
  ).json();
  expect(added.durationSeconds).toBe(3725);
  const changed = await (
    await api.patch(`${base}/${bare.id}`, {
      data: { references: ref("fakeVid0001") },
    })
  ).json();
  expect(changed.durationSeconds).toBe(3725);

  // An unchanged reference triggers no lookup for a song still without a duration.
  const unknown = await (
    await api.post(base, {
      data: { title: "Gone", references: ref("noSuchVid99") },
    })
  ).json();
  expect(unknown.durationSeconds).toBeNull();
  await api.dispose();
});

test("smart add resolves a pasted spotify.link and leaves unknown ones empty", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  const resolve = async (input: string) =>
    (await api.post(`${base}/resolve`, { data: { input } })).json();
  const hit = await resolve("https://spotify.link/fakeTrack1");
  expect(hit.kind).toBe("spotify-link");
  expect(hit.candidates[0]).toMatchObject({
    spotifyTrackId: "fakeTrack1",
    references: [
      { label: "Spotify", value: "https://open.spotify.com/track/fakeTrack1" },
    ],
  });
  expect((await resolve("https://spotify.link/unknownOne")).candidates).toEqual(
    [],
  );
  await api.dispose();
});

test("deleting a reference clears the legacy column so the link does not come back", async ({
  testApi,
}) => {
  const { api, base } = await bandWithClient(testApi);
  await connectSpotify(api);
  await connectYoutube(api);
  const yt = "https://www.youtube.com/watch?v=fakeVid0001";
  const refs = [
    { label: "spotify", value: "https://open.spotify.com/track/fakeTrack1" },
    { label: " YouTube ", value: yt },
  ];
  const song = await addSong(api, base, {
    title: "Dropped",
    spotifyTrackId: "fakeTrack1",
    youtubeUrl: yt,
  });
  // Keeps the fallback while it never had a reference row, even on unrelated edits.
  const untouched = await (
    await api.patch(`${base}/${song.id}`, {
      data: {
        references: [{ label: "Lyrics", value: "https://l.example.com" }],
      },
    })
  ).json();
  expect(untouched).toMatchObject({
    spotifyTrackId: "fakeTrack1",
    youtubeUrl: yt,
  });

  // A control song that stays linked keeps both exports valid.
  await addSong(api, base, {
    title: "Kept",
    references: [
      { label: "Spotify", value: "https://open.spotify.com/track/fakeTrack2" },
      {
        label: "YouTube",
        value: "https://www.youtube.com/watch?v=fakeVid0002",
      },
    ],
  });

  const withRows = await (
    await api.patch(`${base}/${song.id}`, { data: { references: refs } })
  ).json();
  expect(withRows).toMatchObject({
    spotifyTrackId: "fakeTrack1",
    youtubeUrl: yt,
  });

  const cleared = await (
    await api.patch(`${base}/${song.id}`, { data: { references: [] } })
  ).json();
  expect(cleared.spotifyTrackId).toBeNull();
  expect(cleared.youtubeUrl).toBeNull();
  const reread = await (await api.get(`${base}/${song.id}`)).json();
  expect(reread.spotifyTrackId).toBeNull();
  expect(reread.youtubeUrl).toBeNull();

  const spotify = await (
    await api.post(`${base}/export`, { data: { name: "S" } })
  ).json();
  expect(spotify.exported).toBe(1);
  expect(spotify.skipped.map((x: { songId: string }) => x.songId)).toContain(
    song.id,
  );
  const youtube = await (
    await api.post(`${base}/export/youtube`, { data: { name: "Y" } })
  ).json();
  expect(youtube.exported).toBe(1);
  expect(youtube.skipped.map((x: { songId: string }) => x.songId)).toContain(
    song.id,
  );
  await api.dispose();
});
