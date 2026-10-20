import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const NY = "America/New_York";
// 2026-10-27 is a Tuesday.
const FIRST_TUE = "2026-10-27";

type Api = APIRequestContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: Api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

const createBand = async (api: Api, name = "The Foxes"): Promise<string> => {
  const res = await api.post("/bands", { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
};

const me = async (api: Api): Promise<Json> =>
  (await api.get("/auth/me")).json();

const createPractice = async (
  api: Api,
  bandId: string,
  data: Json = {},
): Promise<Json> => {
  const res = await api.post(`/bands/${bandId}/practices`, {
    data: {
      title: "Practice",
      startDate: FIRST_TUE,
      startTime: "19:00",
      durationMinutes: 120,
      timeZone: NY,
      recurrence: { freq: "weekly" },
      ...data,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};

const practiceLink = async (api: Api, seriesId: string, date?: string) =>
  api.get(`/links/practices/${seriesId}`, date ? { params: { date } } : {});

// ------------------------------------------------------- current band

test("lastBandId is null for a new user", async ({ testApi }) => {
  const { api } = await client(testApi, "new@example.com");
  expect((await me(api)).lastBandId).toBeNull();
});

test("creating a band sets lastBandId", async ({ testApi }) => {
  const { api } = await client(testApi, "a@example.com");
  const bandId = await createBand(api);
  expect((await me(api)).lastBandId).toBe(bandId);
  const second = await createBand(api, "Second");
  expect((await me(api)).lastBandId).toBe(second);
});

test("accepting an invite sets lastBandId", async ({ testApi }) => {
  const a = await client(testApi, "a@example.com");
  const b = await client(testApi, "b@example.com");
  const bandId = await createBand(a.api);
  const invite = await (await a.api.get(`/bands/${bandId}/invite`)).json();
  expect((await me(b.api)).lastBandId).toBeNull();
  const res = await b.api.post(`/invites/${invite.token}/accept`);
  expect(res.status()).toBe(200);
  expect((await me(b.api)).lastBandId).toBe(bandId);
});

test("PUT /me/current-band: success and non-member 404", async ({
  testApi,
}) => {
  const a = await client(testApi, "a@example.com");
  const b = await client(testApi, "b@example.com");
  const first = await createBand(a.api, "First");
  await createBand(a.api, "Second");
  const other = await createBand(b.api, "Other");

  const ok = await a.api.put("/me/current-band", { data: { bandId: first } });
  expect(ok.status()).toBe(204);
  expect((await me(a.api)).lastBandId).toBe(first);

  const denied = await a.api.put("/me/current-band", {
    data: { bandId: other },
  });
  expect(denied.status()).toBe(404);
  expect((await me(a.api)).lastBandId).toBe(first);

  const bad = await a.api.put("/me/current-band", {
    data: { bandId: "not-a-uuid" },
  });
  expect(bad.status()).toBe(400);
});

test("lastBandId reads as null after leaving that band", async ({
  testApi,
}) => {
  const a = await client(testApi, "a@example.com");
  const b = await client(testApi, "b@example.com");
  const bandId = await createBand(a.api);
  const invite = await (await a.api.get(`/bands/${bandId}/invite`)).json();
  await b.api.post(`/invites/${invite.token}/accept`);
  expect((await me(b.api)).lastBandId).toBe(bandId);

  const left = await b.api.post(`/bands/${bandId}/leave`, { data: {} });
  expect(left.status()).toBe(204);
  expect((await me(b.api)).lastBandId).toBeNull();
});

// -------------------------------------------------------- link resolvers

test("links: gig and song resolve to their band", async ({ testApi }) => {
  const { api } = await client(testApi, "a@example.com");
  const bandId = await createBand(api);
  const gig = await (
    await api.post(`/bands/${bandId}/gigs`, {
      data: { title: "Show", date: "2026-12-05" },
    })
  ).json();
  const song = await (
    await api.post(`/bands/${bandId}/songs`, {
      data: { title: "Tune", artist: "X", durationSeconds: 200, force: true },
    })
  ).json();

  const g = await api.get(`/links/gigs/${gig.id}`);
  expect(g.status()).toBe(200);
  expect(await g.json()).toEqual({ bandId, gigId: gig.id });

  const s = await api.get(`/links/songs/${song.id}`);
  expect(s.status()).toBe(200);
  expect(await s.json()).toEqual({ bandId, songId: song.id });
});

test("links: practice date match, no match, missing and bad date", async ({
  testApi,
}) => {
  const { api } = await client(testApi, "a@example.com");
  const bandId = await createBand(api);
  const series = await createPractice(api, bandId);

  const hit = await practiceLink(api, series.id, FIRST_TUE);
  expect(hit.status()).toBe(200);
  const body = await hit.json();
  expect(body).toMatchObject({ bandId, seriesId: series.id });
  // 19:00 EDT on 2026-10-27 is 23:00Z.
  expect(body.occurrenceKey).toBe("20261027T230000Z");

  const wed = await (await practiceLink(api, series.id, "2026-10-28")).json();
  expect(wed.occurrenceKey).toBeNull();
  const before = await (
    await practiceLink(api, series.id, "2026-10-20")
  ).json();
  expect(before.occurrenceKey).toBeNull();

  const none = await practiceLink(api, series.id);
  expect(none.status()).toBe(200);
  expect((await none.json()).occurrenceKey).toBeNull();
  const bad = await practiceLink(api, series.id, "10/27/2026");
  expect(bad.status()).toBe(200);
  expect((await bad.json()).occurrenceKey).toBeNull();
});

test("links: practice follows moves and skips cancellations", async ({
  testApi,
}) => {
  const { api } = await client(testApi, "a@example.com");
  const bandId = await createBand(api);
  const series = await createPractice(api, bandId);
  const occ = `/bands/${bandId}/practices/${series.id}/occurrences`;

  const moved = await api.patch(`${occ}/20261027T230000Z`, {
    data: { scope: "this", startDate: "2026-10-29", startTime: "20:00" },
  });
  expect(moved.status(), await moved.text()).toBe(200);
  expect(
    (await (await practiceLink(api, series.id, "2026-10-27")).json())
      .occurrenceKey,
  ).toBeNull();
  // The key stays the original start even though the occurrence moved.
  expect(
    (await (await practiceLink(api, series.id, "2026-10-29")).json())
      .occurrenceKey,
  ).toBe("20261027T230000Z");

  const del = await api.delete(`${occ}/20261104T000000Z?scope=this`);
  expect(del.status()).toBe(204);
  expect(
    (await (await practiceLink(api, series.id, "2026-11-03")).json())
      .occurrenceKey,
  ).toBeNull();
});

test("links: deleted resources and non-members are 404", async ({
  testApi,
}) => {
  const a = await client(testApi, "a@example.com");
  const b = await client(testApi, "b@example.com");
  const bandId = await createBand(a.api);
  const gig = await (
    await a.api.post(`/bands/${bandId}/gigs`, {
      data: { title: "Show", date: "2026-12-05" },
    })
  ).json();
  const song = await (
    await a.api.post(`/bands/${bandId}/songs`, {
      data: { title: "Tune", artist: "X", durationSeconds: 200, force: true },
    })
  ).json();
  const series = await createPractice(a.api, bandId);

  // Non-member gets the same 404 for every resolver.
  expect((await b.api.get(`/links/gigs/${gig.id}`)).status()).toBe(404);
  expect((await b.api.get(`/links/songs/${song.id}`)).status()).toBe(404);
  expect((await practiceLink(b.api, series.id, FIRST_TUE)).status()).toBe(404);

  // Unknown ids and malformed ids are also 404.
  const unknown = "00000000-0000-4000-8000-000000000000";
  expect((await a.api.get(`/links/gigs/${unknown}`)).status()).toBe(404);
  expect((await a.api.get("/links/gigs/nope")).status()).toBe(404);

  // Soft-deleted gig.
  expect(
    (await a.api.delete(`/bands/${bandId}/gigs/${gig.id}`)).status(),
  ).toBeLessThan(300);
  expect((await a.api.get(`/links/gigs/${gig.id}`)).status()).toBe(404);

  // Signed-out callers are rejected.
  const anon = await pwRequest.newContext({ baseURL: API_URL });
  expect((await anon.get(`/links/songs/${song.id}`)).status()).toBe(401);
});
