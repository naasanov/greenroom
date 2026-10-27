import { memberships } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

type Api = APIRequestContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

async function newBand(testApi: TestApi) {
  const a = await client(testApi, "a@example.com");
  const band = await (
    await a.api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  return { ...a, bandId: band.id as string };
}

const song = async (
  api: Api,
  bandId: string,
  title: string,
  durationSeconds: number | null = 200,
): Promise<string> => {
  const res = await api.post(`/bands/${bandId}/songs`, {
    data: { title, artist: "X", durationSeconds, force: true },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
};

const mkGig = async (
  api: Api,
  bandId: string,
  data: Json = {},
): Promise<Json> => {
  const res = await api.post(`/bands/${bandId}/gigs`, {
    data: { title: "Gig", date: "2026-12-01", ...data },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};

const gigSetlist = async (
  api: Api,
  bandId: string,
  gigId: string,
): Promise<Json> => {
  const res = await api.get(`/bands/${bandId}/gigs/${gigId}/setlist`);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
};

const titles = (sl: Json) => sl.items.map((i: Json) => i.title);

const slPath = (bandId: string, id: string) =>
  `/bands/${bandId}/setlists/${id}`;

async function addMember(
  testApi: TestApi,
  db: Parameters<Parameters<typeof test>[2]>[0]["db"],
  bandId: string,
  email: string,
) {
  const c = await client(testApi, email);
  const [m] = await db
    .insert(memberships)
    .values({ bandId, userId: c.user.id, role: "member" })
    .returning();
  return { ...c, membershipId: m!.id };
}

test("setlist: lazy gig setlist, replace order, append, remove, totals", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const [a, b, c] = [
    await song(api, bandId, "A", 100),
    await song(api, bandId, "B", 200),
    await song(api, bandId, "C", null),
  ] as [string, string, string];
  const gig = await mkGig(api, bandId);

  const first = await gigSetlist(api, bandId, gig.id);
  expect(first).toMatchObject({ gigId: gig.id, items: [], songCount: 0 });
  // Same setlist on the second read.
  expect((await gigSetlist(api, bandId, gig.id)).id).toBe(first.id);
  const base = slPath(bandId, first.id);

  let sl = await (
    await api.put(`${base}/items`, { data: { songIds: [b, a, c] } })
  ).json();
  expect(titles(sl)).toEqual(["B", "A", "C"]);
  expect(sl).toMatchObject({
    songCount: 3,
    totalDurationSeconds: 300,
    unknownDurationCount: 1,
  });
  expect(sl.items[0]).toMatchObject({
    songId: b,
    artist: "X",
    durationSeconds: 200,
    youtubeUrl: null,
  });

  const yt = await api.post(`/bands/${bandId}/songs`, {
    data: {
      title: "Y",
      youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      force: true,
    },
  });
  const ytId = (await yt.json()).id;
  sl = await (
    await api.post(`${base}/items`, { data: { songId: ytId } })
  ).json();
  expect(sl.items.at(-1)).toMatchObject({
    songId: ytId,
    youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  });

  // Reorder + remove through a full replace.
  sl = await (
    await api.put(`${base}/items`, { data: { songIds: [c, b] } })
  ).json();
  expect(titles(sl)).toEqual(["C", "B"]);

  // Append is idempotent; remove-one works and is idempotent.
  sl = await (await api.post(`${base}/items`, { data: { songId: a } })).json();
  expect(titles(sl)).toEqual(["C", "B", "A"]);
  sl = await (await api.post(`${base}/items`, { data: { songId: a } })).json();
  expect(titles(sl)).toEqual(["C", "B", "A"]);
  sl = await (await api.delete(`${base}/items/${b}`)).json();
  expect(titles(sl)).toEqual(["C", "A"]);
  sl = await (await api.delete(`${base}/items/${b}`)).json();
  expect(titles(sl)).toEqual(["C", "A"]);

  // Duplicates in one list are rejected; clearing works.
  const dup = await api.put(`${base}/items`, { data: { songIds: [a, a] } });
  expect(dup.status()).toBe(400);
  expect((await dup.json()).code).toBe("DUPLICATE_SONG_IN_SETLIST");
  sl = await (await api.put(`${base}/items`, { data: { songIds: [] } })).json();
  expect(sl).toMatchObject({ items: [], totalDurationSeconds: 0 });
});

test("setlist: songs must belong to the band, other bands are 404", async ({
  testApi,
}) => {
  const x = await newBand(testApi);
  const y = await client(testApi, "y@example.com");
  const yBand = await (
    await y.api.post("/bands", { data: { name: "Other" } })
  ).json();
  const mine = await song(x.api, x.bandId, "Mine");
  const theirs = await song(y.api, yBand.id, "Theirs");

  const gig = await mkGig(x.api, x.bandId);
  const sl = await gigSetlist(x.api, x.bandId, gig.id);
  const bad = await x.api.put(`${slPath(x.bandId, sl.id)}/items`, {
    data: { songIds: [mine, theirs] },
  });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({
    code: "SONG_NOT_FOUND",
    songIds: [theirs],
  });
  expect(
    (
      await x.api.post(`${slPath(x.bandId, sl.id)}/items`, {
        data: { songId: theirs },
      })
    ).status(),
  ).toBe(400);

  // The other band cannot read or edit this setlist; non-members get 404 on the band.
  expect((await y.api.get(slPath(yBand.id, sl.id))).status()).toBe(404);
  expect((await y.api.get(slPath(x.bandId, sl.id))).status()).toBe(404);
  expect(
    (await y.api.get(`/bands/${x.bandId}/gigs/${gig.id}/setlist`)).status(),
  ).toBe(404);
});

test("setlist: a soft-deleted song disappears from reads and totals", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const a = await song(api, bandId, "A", 100);
  const b = await song(api, bandId, "B", 50);
  const gig = await mkGig(api, bandId);
  const sl = await gigSetlist(api, bandId, gig.id);
  await api.put(`${slPath(bandId, sl.id)}/items`, {
    data: { songIds: [a, b] },
  });

  expect((await api.delete(`/bands/${bandId}/songs/${a}`)).status()).toBe(200);
  const after = await gigSetlist(api, bandId, gig.id);
  expect(titles(after)).toEqual(["B"]);
  expect(after).toMatchObject({ songCount: 1, totalDurationSeconds: 50 });
  expect(after.items[0].position).toBe(0);

  // The deleted song can no longer be added.
  const res = await api.post(`${slPath(bandId, sl.id)}/items`, {
    data: { songId: a },
  });
  expect(res.status()).toBe(400);
});

test("setlist: add-song-in-place creates the song and appends it", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const a = await song(api, bandId, "Existing");
  const gig = await mkGig(api, bandId);
  const sl = await gigSetlist(api, bandId, gig.id);
  const base = slPath(bandId, sl.id);
  await api.put(`${base}/items`, { data: { songIds: [a] } });

  const res = await api.post(`${base}/songs`, {
    data: { title: "Brand New", artist: "Y", durationSeconds: 120 },
  });
  expect(res.status(), await res.text()).toBe(201);
  const out = await res.json();
  expect(out.song).toMatchObject({ title: "Brand New", artist: "Y" });
  expect(titles(out.setlist)).toEqual(["Existing", "Brand New"]);
  expect(out.setlist.totalDurationSeconds).toBe(320);

  // The song is in the library too.
  const lib = await (await api.get(`/bands/${bandId}/songs`)).json();
  expect(lib.map((s: Json) => s.title)).toContain("Brand New");

  // Duplicate rules match songs create: 409 unless forced.
  const dup = await api.post(`${base}/songs`, {
    data: { title: "brand new", artist: "y" },
  });
  expect(dup.status()).toBe(409);
  expect(await dup.json()).toMatchObject({
    code: "DUPLICATE_SONG",
    songId: out.song.id,
  });
  const forced = await api.post(`${base}/songs`, {
    data: { title: "brand new", artist: "y", force: true },
  });
  expect(forced.status()).toBe(201);
  expect(titles((await forced.json()).setlist)).toEqual([
    "Existing",
    "Brand New",
    "brand new",
  ]);
});

test("setlist: duplicate a past setlist (history search, replace and append)", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const [a, b, c] = [
    await song(api, bandId, "A"),
    await song(api, bandId, "B"),
    await song(api, bandId, "C"),
  ] as [string, string, string];

  const fill = async (gig: Json, ids: string[]) => {
    const sl = await gigSetlist(api, bandId, gig.id);
    await api.put(`${slPath(bandId, sl.id)}/items`, { data: { songIds: ids } });
    return sl.id as string;
  };
  const old = await mkGig(api, bandId, {
    title: "Spring Bash",
    date: "2026-03-01",
    venueName: "The Roxy",
  });
  const older = await mkGig(api, bandId, {
    title: "Winter Show",
    date: "2026-01-10",
    venueName: "Blue Room",
  });
  const empty = await mkGig(api, bandId, {
    title: "Empty Past",
    date: "2026-02-01",
  });
  await gigSetlist(api, bandId, empty.id);
  const future = await mkGig(api, bandId, {
    title: "Future",
    date: "2099-01-01",
  });
  const oldSl = await fill(old, [a, b]);
  await fill(older, [c]);
  await fill(future, [a]);

  const hist = await (
    await api.get(`/bands/${bandId}/setlists/history`)
  ).json();
  expect(hist.map((h: Json) => h.title)).toEqual([
    "Spring Bash",
    "Winter Show",
  ]);
  expect(hist[0]).toMatchObject({
    gigId: old.id,
    setlistId: oldSl,
    venueName: "The Roxy",
    date: "2026-03-01",
    songCount: 2,
  });
  const byVenue = await (
    await api.get(`/bands/${bandId}/setlists/history`, {
      params: { q: "blue" },
    })
  ).json();
  expect(byVenue.map((h: Json) => h.title)).toEqual(["Winter Show"]);
  const byTitle = await (
    await api.get(`/bands/${bandId}/setlists/history`, {
      params: { q: "SPRING" },
    })
  ).json();
  expect(byTitle).toHaveLength(1);
  expect(
    (
      await api.get(`/bands/${bandId}/setlists/history`, {
        params: { q: "nope" },
      })
    ).status(),
  ).toBe(200);

  // Copy into a new gig's setlist: replace by default, then append skips repeats.
  const target = await mkGig(api, bandId, {
    title: "Target",
    date: "2026-11-01",
  });
  const tsl = await gigSetlist(api, bandId, target.id);
  const copyPath = `${slPath(bandId, tsl.id)}/copy`;
  await api.put(`${slPath(bandId, tsl.id)}/items`, {
    data: { songIds: [c, a] },
  });
  let out = await (
    await api.post(copyPath, { data: { sourceSetlistId: oldSl } })
  ).json();
  expect(titles(out)).toEqual(["A", "B"]);
  await api.put(`${slPath(bandId, tsl.id)}/items`, {
    data: { songIds: [c, a] },
  });
  out = await (
    await api.post(copyPath, {
      data: { sourceSetlistId: oldSl, mode: "append" },
    })
  ).json();
  expect(titles(out)).toEqual(["C", "A", "B"]);
  // The source is untouched.
  expect(titles(await (await api.get(slPath(bandId, oldSl))).json())).toEqual([
    "A",
    "B",
  ]);
  expect(
    (await api.post(copyPath, { data: { sourceSetlistId: tsl.id } })).status(),
  ).toBe(400);
  expect(
    (
      await api.post(copyPath, {
        data: { sourceSetlistId: "00000000-0000-4000-8000-000000000001" },
      })
    ).status(),
  ).toBe(404);
});

// ---------------------------------------------------------------- practices

const KEYS = [
  "20261027T230000Z",
  "20261104T000000Z",
  "20261111T000000Z",
  "20261118T000000Z",
];

async function practice(api: Api, bandId: string) {
  const res = await api.post(`/bands/${bandId}/practices`, {
    data: {
      title: "Practice",
      startDate: "2026-10-27",
      startTime: "19:00",
      durationMinutes: 120,
      timeZone: "America/New_York",
      recurrence: { freq: "weekly" },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const s = await res.json();
  const occ = (i: number) =>
    `/bands/${bandId}/practices/${s.id}/occurrences/${KEYS[i]}`;
  const resolved = async () => {
    const out = [];
    for (let i = 0; i < KEYS.length; i++) {
      const o = await (await api.get(occ(i))).json();
      out.push(o.setlistId as string | null);
    }
    return out;
  };
  return { occ, resolved };
}

test("practice setlists: create for an occurrence, scopes, copy current", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const a = await song(api, bandId, "A");
  const b = await song(api, bandId, "B");
  const p = await practice(api, bandId);

  // this_and_following from occurrence 1 creates a shared setlist for 1..3.
  let r = await (
    await api.post(`${p.occ(1)}/setlist`, {
      data: { scope: "this_and_following" },
    })
  ).json();
  const shared = r.newSetlistId as string;
  expect(r).toMatchObject({
    setlistId: shared,
    source: "forward",
    conflicts: [],
  });
  await api.put(`${slPath(bandId, shared)}/items`, { data: { songIds: [a] } });
  expect(await p.resolved()).toEqual([null, shared, shared, shared]);

  // A custom setlist on occurrence 2 only, starting as a copy of the one in force.
  r = await (
    await api.post(`${p.occ(2)}/setlist`, {
      data: { scope: "this", copyCurrent: true },
    })
  ).json();
  const custom = r.newSetlistId as string;
  expect(custom).not.toBe(shared);
  expect(r).toMatchObject({ setlistId: custom, source: "single" });
  await api.post(`${slPath(bandId, custom)}/items`, { data: { songId: b } });
  expect(titles(await (await api.get(slPath(bandId, custom))).json())).toEqual([
    "A",
    "B",
  ]);
  expect(titles(await (await api.get(slPath(bandId, shared))).json())).toEqual([
    "A",
  ]);
  expect(await p.resolved()).toEqual([null, shared, custom, shared]);

  // Re-creating from occurrence 1 forward flags the custom one, replacing it by default.
  const flagged = await (
    await api.post(`${p.occ(1)}/setlist`, {
      data: {
        scope: "this_and_following",
        onConflict: "keep",
        sourceSetlistId: custom,
      },
    })
  ).json();
  expect(flagged.conflicts.map((c: Json) => c.occurrenceKey)).toEqual([
    KEYS[2],
  ]);
  expect(flagged.conflictsReplaced).toBe(false);
  expect(
    titles(await (await api.get(slPath(bandId, flagged.newSetlistId))).json()),
  ).toEqual(["A", "B"]);
  expect(await p.resolved()).toEqual([
    null,
    flagged.newSetlistId,
    custom,
    flagged.newSetlistId,
  ]);

  // Foreign or unknown sources are rejected.
  expect(
    (
      await api.post(`${p.occ(0)}/setlist`, {
        data: {
          scope: "this",
          sourceSetlistId: "00000000-0000-4000-8000-000000000001",
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.post(`${p.occ(0)}/setlist`, { data: { scope: "nope" } })
    ).status(),
  ).toBe(400);
});

test("practice setlists: clear with scope this and this_and_following", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const mk = async (i: number, scope: string, onConflict?: string) =>
    (
      await (
        await api.post(`${p.occ(i)}/setlist`, { data: { scope, onConflict } })
      ).json()
    ).newSetlistId as string;
  const clear = async (i: number, scope: string, onConflict?: string) => {
    const res = await api.delete(`${p.occ(i)}/setlist`, {
      params: { scope, ...(onConflict ? { onConflict } : {}) },
    });
    expect(res.status(), await res.text()).toBe(200);
    return res.json();
  };

  const f = await mk(0, "this_and_following");
  expect(await p.resolved()).toEqual([f, f, f, f]);

  // Clearing one occurrence that inherits a forward setlist shadows it for that one only.
  let r = await clear(2, "this");
  expect(r).toMatchObject({ setlistId: null, source: null, conflicts: [] });
  expect(await p.resolved()).toEqual([f, f, null, f]);
  const o2 = await (await api.get(p.occ(2))).json();
  expect(o2.setlistId).toBeNull();

  // Assigning again to that occurrence replaces the cleared marker.
  const c2 = await mk(2, "this");
  expect(await p.resolved()).toEqual([f, f, c2, f]);
  // Clearing a custom occurrence under a forward setlist writes a cleared marker again.
  r = await clear(2, "this");
  expect(await p.resolved()).toEqual([f, f, null, f]);

  // Clear this_and_following from 1: occurrence 0 keeps its setlist, 1..3 lose it.
  const custom3 = await mk(3, "this");
  r = await clear(1, "this_and_following", "keep");
  expect(r).toMatchObject({ setlistId: null, conflictsReplaced: false });
  expect(r.conflicts.map((c: Json) => c.occurrenceKey)).toEqual([
    KEYS[2],
    KEYS[3],
  ]);
  expect(await p.resolved()).toEqual([f, null, null, custom3]);

  // Replace mode also removes later custom setlists.
  r = await clear(1, "this_and_following");
  expect(r.conflictsReplaced).toBe(true);
  expect(await p.resolved()).toEqual([f, null, null, null]);

  // Clearing everything from the first occurrence leaves no setlist anywhere.
  await clear(0, "this_and_following");
  expect(await p.resolved()).toEqual([null, null, null, null]);

  // A cleared occurrence with no setlist anywhere stays clear without error.
  await clear(3, "this");
  expect(await p.resolved()).toEqual([null, null, null, null]);

  // Bad scope and unknown occurrence.
  expect((await api.delete(`${p.occ(0)}/setlist`)).status()).toBe(400);
  expect(
    (
      await api.delete(
        `/bands/${bandId}/practices/${(await api.get(p.occ(0)).then((x) => x.json())).seriesId}/occurrences/20261028T000000Z/setlist`,
        { params: { scope: "this" } },
      )
    ).status(),
  ).toBe(404);
});

// ---------------------------------------------------------------- lineup

test("lineup: new gigs default to the full active band", async ({
  testApi,
  db,
}) => {
  const a = await newBand(testApi);
  const b = await addMember(testApi, db, a.bandId, "b@example.com");
  const gone = await addMember(testApi, db, a.bandId, "gone@example.com");
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, gone.membershipId));

  const gig = await mkGig(a.api, a.bandId);
  const lineup = await (
    await a.api.get(`/bands/${a.bandId}/gigs/${gig.id}/lineup`)
  ).json();
  expect(lineup.gigId).toBe(gig.id);
  expect(lineup.members.map((m: Json) => m.userId).sort()).toEqual(
    [a.user.id, b.user.id].sort(),
  );
  expect(lineup.members.every((m: Json) => m.left === false)).toBe(true);
  expect(lineup.members[0]).toHaveProperty("displayName");

  // A band member who is not the creator can read it too; outsiders get 404.
  expect(
    (await b.api.get(`/bands/${a.bandId}/gigs/${gig.id}/lineup`)).status(),
  ).toBe(200);
  const out = await client(testApi, "out@example.com");
  expect(
    (await out.api.get(`/bands/${a.bandId}/gigs/${gig.id}/lineup`)).status(),
  ).toBe(404);
});

test("lineup: replace validates members and keeps former members on past gigs", async ({
  testApi,
  db,
}) => {
  const a = await newBand(testApi);
  const b = await addMember(testApi, db, a.bandId, "b@example.com");
  const c = await addMember(testApi, db, a.bandId, "c@example.com");
  const [aMem] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, a.user.id));
  const url = (gigId: string) => `/bands/${a.bandId}/gigs/${gigId}/lineup`;

  const gig = await mkGig(a.api, a.bandId, { date: "2099-05-05" });
  let res = await a.api.put(url(gig.id), {
    data: { membershipIds: [aMem!.id, c.membershipId, c.membershipId] },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(
    (await res.json()).members.map((m: Json) => m.membershipId).sort(),
  ).toEqual([aMem!.id, c.membershipId].sort());

  // Memberships from another band are rejected.
  const y = await client(testApi, "y@example.com");
  const yBand = await (
    await y.api.post("/bands", { data: { name: "Other" } })
  ).json();
  const [yMem] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.bandId, yBand.id));
  res = await a.api.put(url(gig.id), { data: { membershipIds: [yMem!.id] } });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("INVALID_MEMBERSHIP");
  expect(
    (await a.api.put(url(gig.id), { data: { membershipIds: ["x"] } })).status(),
  ).toBe(400);

  // Past gig: b is in the lineup, then leaves. They stay listed with left: true,
  // even when a client sends a list without them.
  const fut = await mkGig(a.api, a.bandId, { date: "2099-06-06" });
  const past = await mkGig(a.api, a.bandId, { date: "2026-01-01" });
  await a.api.put(url(past.id), {
    data: { membershipIds: [aMem!.id, b.membershipId] },
  });
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, b.membershipId));
  let lineup = await (await a.api.get(url(past.id))).json();
  expect(lineup.members.map((m: Json) => [m.userId, m.left])).toEqual(
    expect.arrayContaining([
      [a.user.id, false],
      [b.user.id, true],
    ]),
  );
  lineup = await (
    await a.api.put(url(past.id), {
      data: { membershipIds: [aMem!.id, c.membershipId] },
    })
  ).json();
  expect(lineup.members.map((m: Json) => [m.userId, m.left]).sort()).toEqual(
    [
      [a.user.id, false],
      [b.user.id, true],
      [c.user.id, false],
    ].sort(),
  );
  // A former member cannot be newly added to a lineup they were never in.
  res = await a.api.put(url(gig.id), {
    data: { membershipIds: [aMem!.id, b.membershipId] },
  });
  expect(res.status()).toBe(400);
  // On a future gig a former member already listed can be dropped.
  const dropped = await (
    await a.api.put(url(fut.id), {
      data: { membershipIds: [aMem!.id, c.membershipId] },
    })
  ).json();
  expect(dropped.members.map((m: Json) => m.userId).sort()).toEqual(
    [a.user.id, c.user.id].sort(),
  );
});

test("lineup: copy from the last gig that has a lineup", async ({
  testApi,
  db,
}) => {
  const a = await newBand(testApi);
  const b = await addMember(testApi, db, a.bandId, "b@example.com");
  const c = await addMember(testApi, db, a.bandId, "c@example.com");
  const url = (gigId: string) => `/bands/${a.bandId}/gigs/${gigId}/lineup`;
  const [aMem] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, a.user.id));

  const first = await mkGig(a.api, a.bandId, {
    title: "First",
    date: "2026-02-01",
  });
  const second = await mkGig(a.api, a.bandId, {
    title: "Second",
    date: "2026-03-01",
  });
  const noLineup = await mkGig(a.api, a.bandId, {
    title: "Bare",
    date: "2026-04-01",
  });
  const target = await mkGig(a.api, a.bandId, {
    title: "Target",
    date: "2026-05-01",
  });
  const later = await mkGig(a.api, a.bandId, {
    title: "Later",
    date: "2026-06-01",
  });

  await a.api.put(url(first.id), { data: { membershipIds: [aMem!.id] } });
  await a.api.put(url(second.id), {
    data: { membershipIds: [aMem!.id, b.membershipId, c.membershipId] },
  });
  await a.api.put(url(noLineup.id), { data: { membershipIds: [] } });
  await a.api.put(url(target.id), { data: { membershipIds: [aMem!.id] } });
  // c leaves: not copied. Later gigs never act as a source.
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, c.membershipId));
  await a.api.put(url(later.id), { data: { membershipIds: [b.membershipId] } });

  const res = await a.api.post(`${url(target.id)}/copy-from-last`);
  expect(res.status(), await res.text()).toBe(200);
  const out = await res.json();
  expect(out.sourceGigId).toBe(second.id);
  expect(out.members.map((m: Json) => m.userId).sort()).toEqual(
    [a.user.id, b.user.id].sort(),
  );
  expect((await (await a.api.get(url(target.id))).json()).members).toHaveLength(
    2,
  );

  // The very first gig has no earlier lineup.
  const none = await a.api.post(`${url(first.id)}/copy-from-last`);
  expect(none.status()).toBe(404);
  expect((await none.json()).code).toBe("NO_PREVIOUS_LINEUP");
});
