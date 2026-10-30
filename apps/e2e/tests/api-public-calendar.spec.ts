import { BANDS, USERS, bands, gigs } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { anon, clientFor } from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const BAND = BANDS.nightOwls.id;
const linkUrl = `/bands/${BAND}/public-calendar`;
const tokenOf = (url: string) => url.split("/c/")[1]!;

const PRIVATE_KEYS = [
  "id",
  "bandId",
  "setlist",
  "lineup",
  "notes",
  "contactName",
  "contactPhone",
  "contactEmail",
  "loadInTime",
  "loadInAt",
  "address",
  "members",
  "email",
  "driveFolderId",
  "media",
  "practices",
];

test("admin reads and resets the link; the old token stops working", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const pub = await anon();
  const first = await (await ava.get(linkUrl)).json();
  expect(first.url).toContain("/c/");
  expect(await (await ava.get(linkUrl)).json()).toEqual(first);
  const oldToken = tokenOf(first.url);
  expect((await pub.get(`/public/calendar/${oldToken}`)).status()).toBe(200);

  const reset = await ava.post(`${linkUrl}/reset`);
  expect(reset.status()).toBe(200);
  const next = await reset.json();
  expect(tokenOf(next.url)).not.toBe(oldToken);
  expect((await pub.get(`/public/calendar/${oldToken}`)).status()).toBe(404);
  expect(
    (await pub.get(`/public/calendar/${tokenOf(next.url)}`)).status(),
  ).toBe(200);
});

test("only admins manage the link", async ({ testApi }) => {
  await testApi.seed("band");
  const dev = await clientFor(testApi, USERS.dev.email);
  expect((await dev.get(linkUrl)).status()).toBe(403);
  expect((await dev.post(`${linkUrl}/reset`)).status()).toBe(403);
  const pub = await anon();
  expect((await pub.get(linkUrl)).status()).toBe(401);
});

test("public payload lists only shown upcoming gigs with public fields", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const pub = await anon();
  const token = tokenOf((await (await ava.get(linkUrl)).json()).url);
  const res = await pub.get(`/public/calendar/${token}`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.bandName).toBe("The Night Owls");
  expect(body.bio).toMatch(/rehearsal room/);
  const titles = body.gigs.map((g: { title: string }) => g.title);
  expect(titles).toEqual(["Club Meridian", "Maybe Brewery Night"]);
  expect(body.gigs[0]).toEqual({
    title: "Club Meridian",
    date: seeded.gigs.upcomingClub.date,
    startTime: "20:00",
    venueName: "Club Meridian",
  });
  expect(body.gigs[1].startTime).toBeNull();

  // Toggling a gig off removes it; toggling on adds it back.
  const res2 = await ava.patch(
    `/bands/${BAND}/gigs/${seeded.gigs.upcomingClub.id}`,
    {
      data: { showOnPublicCalendar: false },
    },
  );
  expect((await res2.json()).showOnPublicCalendar).toBe(false);
  const after = await (await pub.get(`/public/calendar/${token}`)).json();
  expect(after.gigs.map((g: { title: string }) => g.title)).toEqual([
    "Maybe Brewery Night",
  ]);
  await db
    .update(gigs)
    .set({ showOnPublicCalendar: true })
    .where(eq(gigs.id, seeded.gigs.upcomingClub.id));
  expect(
    (await (await pub.get(`/public/calendar/${token}`)).json()).gigs,
  ).toHaveLength(2);
});

test("new gigs default to shown", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const created = await ava.post(`/bands/${BAND}/gigs`, {
    data: { title: "Defaulted", date: "2099-01-01" },
  });
  expect((await created.json()).showOnPublicCalendar).toBe(true);
});

test("the response never leaks private fields", async ({ testApi, db }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  await db
    .update(bands)
    .set({
      photoUrl: "https://example.com/p.png",
      bookingContact: "book@owls.test",
      socialLinks: {
        instagram: "https://instagram.com/owls",
        secretThing: "https://hidden.test",
      },
    })
    .where(eq(bands.id, BAND));
  const token = tokenOf((await (await ava.get(linkUrl)).json()).url);
  const raw = await (
    await (await anon()).get(`/public/calendar/${token}`)
  ).text();
  const body = JSON.parse(raw);

  expect(Object.keys(body).sort()).toEqual([
    "bandName",
    "bio",
    "bookingEmail",
    "gigs",
    "photoUrl",
    "socialLinks",
  ]);
  expect(body.bookingEmail).toBe("book@owls.test");
  expect(body.socialLinks).toEqual({ instagram: "https://instagram.com/owls" });
  for (const g of body.gigs) {
    expect(Object.keys(g).sort()).toEqual([
      "date",
      "startTime",
      "title",
      "venueName",
    ]);
  }
  for (const key of PRIVATE_KEYS) expect(body).not.toHaveProperty(key);
  // Seeded private values must not appear anywhere in the payload.
  for (const secret of [
    "Pat Promoter",
    "pat@example.com",
    "88 Main St",
    "Private Party",
    "Side Project",
    BAND,
    USERS.ava.email,
    USERS.ava.displayName,
    "Rusty Anchor",
  ]) {
    expect(raw).not.toContain(secret);
  }
});

test("unknown tokens 404 and the endpoint is rate limited per IP", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const pub = await anon();
  expect(
    (await pub.get("/public/calendar/not-a-real-token-1234567890")).status(),
  ).toBe(404);
  expect((await pub.get("/public/calendar/short")).status()).toBe(404);

  const ip = `10.9.${Date.now() % 250}.${Math.floor(Math.random() * 250)}`;
  const limited = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { "x-test-ip": ip },
  });
  const statuses: number[] = [];
  for (let i = 0; i < 70; i++) {
    statuses.push(
      (
        await limited.get("/public/calendar/not-a-real-token-1234567890")
      ).status(),
    );
  }
  expect(statuses).toContain(429);
});
