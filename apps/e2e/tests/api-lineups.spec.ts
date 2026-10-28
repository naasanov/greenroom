import { memberships } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

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

async function newBand(testApi: TestApi, email = "a@example.com") {
  const a = await client(testApi, email);
  const band = await (
    await a.api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  return { ...a, bandId: band.id as string };
}

const mkGig = async (
  api: APIRequestContext,
  bandId: string,
  data: Json = {},
): Promise<Json> => {
  const res = await api.post(`/bands/${bandId}/gigs`, {
    data: { title: "Gig", date: "2099-12-01", ...data },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};

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

test("lineup history: past gigs with members, newest first, q, band scoped", async ({
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
  const history = async (params: Json = {}) => {
    const res = await a.api.get(`/bands/${a.bandId}/lineups/history`, {
      params,
    });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as Json[];
  };

  const spring = await mkGig(a.api, a.bandId, {
    title: "Spring Bash",
    date: "2026-03-01",
    venueName: "The Roxy",
  });
  const winter = await mkGig(a.api, a.bandId, {
    title: "Winter Show",
    date: "2026-01-10",
    venueName: "Blue Room",
  });
  const bare = await mkGig(a.api, a.bandId, {
    title: "Bare",
    date: "2026-02-01",
  });
  const future = await mkGig(a.api, a.bandId, {
    title: "Future",
    date: "2099-01-01",
  });
  const gone = await mkGig(a.api, a.bandId, {
    title: "Only Leavers",
    date: "2026-02-15",
  });
  const deleted = await mkGig(a.api, a.bandId, {
    title: "Deleted",
    date: "2026-02-20",
  });
  await a.api.put(url(spring.id), {
    data: { membershipIds: [aMem!.id, b.membershipId, c.membershipId] },
  });
  await a.api.put(url(winter.id), { data: { membershipIds: [aMem!.id] } });
  await a.api.put(url(bare.id), { data: { membershipIds: [] } });
  await a.api.put(url(future.id), { data: { membershipIds: [aMem!.id] } });
  await a.api.put(url(gone.id), { data: { membershipIds: [c.membershipId] } });
  expect(
    (await a.api.delete(`/bands/${a.bandId}/gigs/${deleted.id}`)).status(),
  ).toBeLessThan(300);

  // Another band's gigs never appear.
  const other = await newBand(testApi, "z@example.com");
  await mkGig(other.api, other.bandId, {
    title: "Spring Elsewhere",
    date: "2026-03-05",
  });

  // c leaves: no longer counted, and a gig with only leavers drops out.
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, c.membershipId));

  expect(await history()).toEqual([
    {
      gigId: spring.id,
      title: "Spring Bash",
      venueName: "The Roxy",
      date: "2026-03-01",
      memberCount: 2,
    },
    {
      gigId: winter.id,
      title: "Winter Show",
      venueName: "Blue Room",
      date: "2026-01-10",
      memberCount: 1,
    },
  ]);

  expect((await history({ q: "spring" })).map((e) => e.gigId)).toEqual([
    spring.id,
  ]);
  expect((await history({ q: "blue" })).map((e) => e.gigId)).toEqual([
    winter.id,
  ]);
  expect(await history({ q: "nope" })).toEqual([]);
  expect(await history({ limit: 1 })).toHaveLength(1);
  expect(
    (await a.api.get(`/bands/${a.bandId}/lineups/history?limit=0`)).status(),
  ).toBe(400);

  // Members only; the other band sees only its own gig.
  const out = await client(testApi, "out@example.com");
  expect(
    (await out.api.get(`/bands/${a.bandId}/lineups/history`)).status(),
  ).toBe(404);
  const theirs = (await (
    await other.api.get(`/bands/${other.bandId}/lineups/history`)
  ).json()) as Json[];
  expect(theirs.map((e) => e.title)).toEqual(["Spring Elsewhere"]);
});

test("lineup copy: replaces the target with the source gig's members", async ({
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

  const source = await mkGig(a.api, a.bandId, {
    title: "Source",
    date: "2026-03-01",
  });
  const target = await mkGig(a.api, a.bandId, {
    title: "Target",
    date: "2099-04-01",
  });
  await a.api.put(url(source.id), {
    data: { membershipIds: [b.membershipId, c.membershipId] },
  });
  await a.api.put(url(target.id), { data: { membershipIds: [aMem!.id] } });
  // c leaves after the source gig: not copied.
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, c.membershipId));

  const res = await a.api.post(`${url(target.id)}/copy`, {
    data: { sourceGigId: source.id },
  });
  expect(res.status(), await res.text()).toBe(200);
  const out = await res.json();
  expect(out.gigId).toBe(target.id);
  expect(out.members.map((m: Json) => m.userId)).toEqual([b.user.id]);
  expect(
    (await (await a.api.get(url(target.id))).json()).members.map(
      (m: Json) => m.userId,
    ),
  ).toEqual([b.user.id]);
  // The source is untouched.
  expect((await (await a.api.get(url(source.id))).json()).members).toHaveLength(
    2,
  );

  // Unknown, malformed and foreign source gigs.
  const other = await newBand(testApi, "z@example.com");
  const foreign = await mkGig(other.api, other.bandId, { date: "2026-03-01" });
  for (const sourceGigId of [
    foreign.id,
    "00000000-0000-4000-8000-000000000000",
  ]) {
    const miss = await a.api.post(`${url(target.id)}/copy`, {
      data: { sourceGigId },
    });
    expect(miss.status()).toBe(404);
  }
  expect(
    (
      await a.api.post(`${url(target.id)}/copy`, { data: { sourceGigId: "x" } })
    ).status(),
  ).toBe(400);
  // The failed copies left the target as it was.
  expect(
    (await (await a.api.get(url(target.id))).json()).members.map(
      (m: Json) => m.userId,
    ),
  ).toEqual([b.user.id]);
});
