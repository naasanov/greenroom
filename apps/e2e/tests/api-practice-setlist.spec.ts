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
  const read = async (i: number): Promise<Json> =>
    (await api.get(occ(i))).json();
  const resolved = async () => {
    const out = [];
    for (let i = 0; i < KEYS.length; i++) out.push((await read(i)).setlistId);
    return out as (string | null)[];
  };
  const starts = async () => {
    const out = [];
    for (let i = 0; i < KEYS.length; i++)
      out.push((await read(i)).setlistStartsHere as boolean);
    return out;
  };
  const assign = async (i: number, data: Json): Promise<Json> => {
    const res = await api.post(`${occ(i)}/setlist`, { data });
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
  };
  const clear = async (i: number, scope: string, onConflict?: string) => {
    const res = await api.delete(`${occ(i)}/setlist`, {
      params: { scope, ...(onConflict ? { onConflict } : {}) },
    });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as Json;
  };
  return { occ, read, resolved, starts, assign, clear };
}

const keysOf = (r: Json) => r.conflicts.map((c: Json) => c.occurrenceKey);

test("fork at a later occurrence leaves earlier ones untouched", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const f = (await p.assign(0, { scope: "this_and_following" })).newSetlistId;
  expect(await p.resolved()).toEqual([f, f, f, f]);
  expect(await p.starts()).toEqual([true, false, false, false]);

  const r = await p.assign(2, {
    scope: "this_and_following",
    copyCurrent: true,
  });
  const g = r.newSetlistId as string;
  expect(g).not.toBe(f);
  expect(r).toMatchObject({
    setlistId: g,
    source: "forward",
    setlistStartsHere: true,
    conflicts: [],
  });
  expect(await p.resolved()).toEqual([f, f, g, g]);
  expect(await p.starts()).toEqual([true, false, true, false]);
});

test("conflicts list later forward rows and single rows", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const f2 = (await p.assign(2, { scope: "this_and_following" })).newSetlistId;
  const s3 = (await p.assign(3, { scope: "this" })).newSetlistId;

  expect(
    (await p.read(0)).laterCustomSetlists.map((c: Json) => [
      c.occurrenceKey,
      c.setlistId,
    ]),
  ).toEqual([
    [KEYS[2], f2],
    [KEYS[3], s3],
  ]);
  expect((await p.read(2)).laterCustomSetlists).toHaveLength(1);
  expect((await p.read(3)).laterCustomSetlists).toEqual([]);

  const r = await p.assign(1, {
    scope: "this_and_following",
    onConflict: "keep",
  });
  expect(keysOf(r)).toEqual([KEYS[2], KEYS[3]]);
  expect(r.conflictsReplaced).toBe(false);
});

test("keep stops at the next custom occurrence", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const f = (await p.assign(0, { scope: "this_and_following" })).newSetlistId;
  const g = (await p.assign(3, { scope: "this_and_following" })).newSetlistId;
  expect(await p.resolved()).toEqual([f, f, f, g]);

  const r = await p.assign(1, {
    scope: "this_and_following",
    onConflict: "keep",
  });
  const h = r.newSetlistId as string;
  expect(keysOf(r)).toEqual([KEYS[3]]);
  expect(await p.resolved()).toEqual([f, h, h, g]);
  expect(await p.starts()).toEqual([true, true, false, true]);
});

test("replace drops later custom rows", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const f = (await p.assign(0, { scope: "this_and_following" })).newSetlistId;
  await p.assign(2, { scope: "this" });
  await p.assign(3, { scope: "this_and_following" });

  const r = await p.assign(1, { scope: "this_and_following" });
  const h = r.newSetlistId as string;
  expect(keysOf(r)).toEqual([KEYS[2], KEYS[3]]);
  expect(r.conflictsReplaced).toBe(true);
  expect(await p.resolved()).toEqual([f, h, h, h]);
  expect(await p.starts()).toEqual([true, true, false, false]);
});

test("setlistStartsHere: forward, single, inherited and none", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  expect(await p.starts()).toEqual([false, false, false, false]);

  const f = await p.assign(1, { scope: "this_and_following" });
  expect(f.setlistStartsHere).toBe(true);
  expect(await p.starts()).toEqual([false, true, false, false]);

  const s = await p.assign(2, { scope: "this" });
  expect(s.setlistStartsHere).toBe(true);
  expect(await p.starts()).toEqual([false, true, true, false]);

  // A cleared occurrence has no setlist, so nothing starts there.
  const c = await p.clear(2, "this");
  expect(c.setlistStartsHere).toBe(false);
  expect(await p.starts()).toEqual([false, true, false, false]);
});

test("clearing with keep leaves later rows, with replace removes them", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const p = await practice(api, bandId);
  const f = (await p.assign(0, { scope: "this_and_following" })).newSetlistId;
  const g = (await p.assign(3, { scope: "this_and_following" })).newSetlistId;

  let r = await p.clear(1, "this_and_following", "keep");
  expect(r).toMatchObject({ setlistId: null, conflictsReplaced: false });
  expect(keysOf(r)).toEqual([KEYS[3]]);
  expect(await p.resolved()).toEqual([f, null, null, g]);

  r = await p.clear(1, "this_and_following");
  expect(r.conflictsReplaced).toBe(true);
  expect(await p.resolved()).toEqual([f, null, null, null]);

  // With no earlier setlist, clearing with keep needs no marker.
  const q = await practice(api, bandId);
  const h = (await q.assign(2, { scope: "this_and_following" })).newSetlistId;
  r = await q.clear(0, "this_and_following", "keep");
  expect(r.setlistId).toBeNull();
  expect(await q.resolved()).toEqual([null, null, h, h]);
});
