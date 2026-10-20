import { gigs, memberships, setlists } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const NY = "America/New_York";
// 2026-10-27 is a Tuesday; US daylight time ends Sunday 2026-11-01.
const FIRST_TUE = "2026-10-27";
const WIDE_FROM = "2026-10-01T00:00:00Z";
const WIDE_TO = "2027-03-01T00:00:00Z";

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

type Api = APIRequestContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const listEvents = async (
  api: Api,
  bandId: string,
  from = WIDE_FROM,
  to = WIDE_TO,
  type?: string,
): Promise<Json[]> => {
  const res = await api.get(`/bands/${bandId}/events`, {
    params: { from, to, ...(type ? { type } : {}) },
  });
  expect(res.status()).toBe(200);
  return res.json();
};

const createPractice = async (
  api: Api,
  bandId: string,
  data: Json,
): Promise<Json> => {
  const res = await api.post(`/bands/${bandId}/practices`, {
    data: {
      title: "Practice",
      startDate: FIRST_TUE,
      startTime: "19:00",
      durationMinutes: 120,
      timeZone: NY,
      ...data,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};

const weekly = (extra: Json = {}) => ({
  recurrence: { freq: "weekly", ...extra },
});

const occPath = (bandId: string, seriesId: string, key: string) =>
  `/bands/${bandId}/practices/${seriesId}/occurrences/${key}`;

const starts = (events: Json[]) => events.map((e) => e.startsAt);

// ---------------------------------------------------------------- gigs

test("gig: minimal create, full create, patch, get", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);

  const res = await api.post(`/bands/${bandId}/gigs`, {
    data: { title: "TBD show", date: "2026-12-05" },
  });
  expect(res.status()).toBe(201);
  const minimal = await res.json();
  expect(minimal).toMatchObject({
    title: "TBD show",
    date: "2026-12-05",
    allDay: false,
    startsAt: null,
    endsAt: null,
    loadInAt: null,
    timeZone: "UTC",
    showOnPublicCalendar: true,
    venueName: null,
  });

  const full = await (
    await api.post(`/bands/${bandId}/gigs`, {
      data: {
        title: "Bowery",
        date: "2026-12-05",
        timeZone: NY,
        loadInTime: "18:00",
        startTime: "21:00",
        endTime: "00:30",
        venueName: "Bowery Ballroom",
        googlePlaceId: "fake-place-bowery",
        address: "6 Delancey St",
        lat: 40.72,
        lng: -73.99,
        contactName: "Sam",
        contactPhone: "555-0100",
        contactEmail: "sam@example.com",
        notes: "Bring pedals",
        showOnPublicCalendar: false,
      },
    })
  ).json();
  expect(full).toMatchObject({
    loadInAt: "2026-12-05T23:00:00.000Z",
    startsAt: "2026-12-06T02:00:00.000Z",
    // End before start rolls to the next local day.
    endsAt: "2026-12-06T05:30:00.000Z",
    startTime: "21:00",
    endTime: "00:30",
    showOnPublicCalendar: false,
    lat: 40.72,
  });

  const patched = await (
    await api.patch(`/bands/${bandId}/gigs/${full.id}`, {
      data: { title: "Bowery (moved)", date: "2026-12-12", notes: null },
    })
  ).json();
  expect(patched).toMatchObject({
    title: "Bowery (moved)",
    date: "2026-12-12",
    notes: null,
    startsAt: "2026-12-13T02:00:00.000Z",
    venueName: "Bowery Ballroom",
  });

  const cleared = await (
    await api.patch(`/bands/${bandId}/gigs/${full.id}`, {
      data: { allDay: true },
    })
  ).json();
  expect(cleared).toMatchObject({
    allDay: true,
    startsAt: null,
    endsAt: null,
    loadInAt: null,
  });

  const got = await (await api.get(`/bands/${bandId}/gigs/${full.id}`)).json();
  expect(got.id).toBe(full.id);
});

test("gig: validation", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const post = (data: Json) => api.post(`/bands/${bandId}/gigs`, { data });
  expect((await post({ date: "2026-12-05" })).status()).toBe(400);
  expect((await post({ title: "x" })).status()).toBe(400);
  expect((await post({ title: "x", date: "12/05/2026" })).status()).toBe(400);
  expect(
    (
      await post({ title: "x", date: "2026-12-05", startTime: "25:00" })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post({
        title: "x",
        date: "2026-12-05",
        allDay: true,
        startTime: "20:00",
      })
    ).status(),
  ).toBe(400);
  expect(
    (await post({ title: "x", date: "2026-12-05", endTime: "22:00" })).status(),
  ).toBe(400);
  expect(
    (
      await post({ title: "x", date: "2026-12-05", timeZone: "Mars/Base" })
    ).status(),
  ).toBe(400);
  expect(
    (await post({ title: "x", date: "2026-12-05", lat: 120 })).status(),
  ).toBe(400);
});

test("gig: soft delete hides it and leaves drive fields alone", async ({
  testApi,
  db,
}) => {
  const { api, bandId } = await newBand(testApi);
  const gig = await (
    await api.post(`/bands/${bandId}/gigs`, {
      data: { title: "Doomed", date: "2026-12-05" },
    })
  ).json();
  await db
    .update(gigs)
    .set({ driveFolderId: "drive-folder-1" })
    .where(eq(gigs.id, gig.id));

  expect((await api.delete(`/bands/${bandId}/gigs/${gig.id}`)).status()).toBe(
    204,
  );
  expect((await api.get(`/bands/${bandId}/gigs/${gig.id}`)).status()).toBe(404);
  expect(
    (
      await api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
        data: { title: "x" },
      })
    ).status(),
  ).toBe(404);
  expect((await listEvents(api, bandId)).length).toBe(0);

  const [row] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(row?.deletedAt).not.toBeNull();
  expect(row?.driveFolderId).toBe("drive-folder-1");
});

test("band scoping: non-members get 404, other bands' gigs are unreachable", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const other = await client(testApi, "outsider@example.com");
  const gig = await (
    await api.post(`/bands/${bandId}/gigs`, {
      data: { title: "Secret", date: "2026-12-05" },
    })
  ).json();
  expect(
    (await other.api.get(`/bands/${bandId}/gigs/${gig.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await other.api.post(`/bands/${bandId}/gigs`, {
        data: { title: "x", date: "2026-12-05" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.api.get(`/bands/${bandId}/events`, {
        params: { from: WIDE_FROM, to: WIDE_TO },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.api.get(`/bands/${bandId}/places/autocomplete?q=bow`)
    ).status(),
  ).toBe(404);

  // A gig id under a band the caller belongs to, but from another band.
  const own = await (
    await other.api.post("/bands", { data: { name: "Mine" } })
  ).json();
  expect(
    (await other.api.get(`/bands/${own.id}/gigs/${gig.id}`)).status(),
  ).toBe(404);
  expect(
    (await other.api.get(`/bands/${own.id}/gigs/not-a-uuid`)).status(),
  ).toBe(404);
});

// ---------------------------------------------------------------- practices

test("practice: weekly rule keeps local time across the DST boundary", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const series = await createPractice(api, bandId, {
    title: "Tuesday jam",
    location: "The garage",
    ...weekly({ end: { type: "count", count: 4 } }),
  });
  expect(series.rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4");
  expect(series).toMatchObject({
    startDate: FIRST_TUE,
    startTime: "19:00",
    timeZone: NY,
    durationMinutes: 120,
    recurrence: {
      freq: "weekly",
      interval: 1,
      byWeekday: ["TU"],
      end: { type: "count", count: 4 },
    },
  });

  const events = await listEvents(api, bandId);
  expect(starts(events)).toEqual([
    "2026-10-27T23:00:00.000Z", // 19:00 EDT
    "2026-11-04T00:00:00.000Z", // 19:00 EST, after DST ends
    "2026-11-11T00:00:00.000Z",
    "2026-11-18T00:00:00.000Z",
  ]);
  expect(events[0]).toMatchObject({
    type: "practice",
    seriesId: series.id,
    occurrenceKey: "20261027T230000Z",
    id: `${series.id}_20261027T230000Z`,
    originalStart: "2026-10-27T23:00:00.000Z",
    endsAt: "2026-10-28T01:00:00.000Z",
    date: FIRST_TUE,
    title: "Tuesday jam",
    location: "The garage",
    recurring: true,
    modified: false,
  });
  // Every occurrence reads 19:00 on the local clock.
  for (const e of events) {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: NY,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(e.startsAt));
    expect(local).toBe("19:00");
  }

  // Spring forward: weekly Sunday 09:00 straddling 2027-03-14.
  const spring = await createPractice(api, bandId, {
    title: "Sunday",
    startDate: "2027-03-07",
    startTime: "09:00",
    ...weekly({ end: { type: "count", count: 3 } }),
  });
  const sp = await listEvents(
    api,
    bandId,
    "2027-03-01T00:00:00Z",
    "2027-04-01T00:00:00Z",
  );
  expect(starts(sp.filter((e) => e.seriesId === spring.id))).toEqual([
    "2027-03-07T14:00:00.000Z", // EST
    "2027-03-14T13:00:00.000Z", // EDT
    "2027-03-21T13:00:00.000Z",
  ]);
});

test("practice: recurrence variants and rrule strings", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const rule = async (data: Json) =>
    (await createPractice(api, bandId, data)).rrule;

  expect(await rule({ recurrence: { freq: "none" } })).toBe(
    "RRULE:FREQ=DAILY;COUNT=1",
  );
  expect(await rule(weekly({ interval: 2 }))).toBe(
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
  );
  expect(await rule(weekly({ byWeekday: ["TH", "TU"] }))).toBe(
    "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
  );
  expect(await rule({ recurrence: { freq: "monthly" } })).toBe(
    "RRULE:FREQ=MONTHLY;BYMONTHDAY=27",
  );
  expect(
    await rule({ recurrence: { freq: "monthly", monthlyMode: "nthWeekday" } }),
  ).toBe("RRULE:FREQ=MONTHLY;BYDAY=4TU");
  expect(
    await rule({
      startDate: "2026-11-10",
      recurrence: { freq: "monthly", monthlyMode: "nthWeekday" },
    }),
  ).toBe("RRULE:FREQ=MONTHLY;BYDAY=2TU");
  // 2026-11-04 local 23:59:59 is 2026-11-05T04:59:59Z.
  expect(
    await rule(weekly({ end: { type: "until", date: "2026-11-04" } })),
  ).toBe("RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261105T045959Z");

  const tuTh = await createPractice(api, bandId, {
    ...weekly({ byWeekday: ["TU", "TH"], end: { type: "count", count: 5 } }),
  });
  const ev = await listEvents(api, bandId);
  expect(starts(ev.filter((e) => e.seriesId === tuTh.id))).toEqual([
    "2026-10-27T23:00:00.000Z",
    "2026-10-29T23:00:00.000Z",
    "2026-11-04T00:00:00.000Z", // Tue Nov 3
    "2026-11-06T00:00:00.000Z", // Thu Nov 5
    "2026-11-11T00:00:00.000Z", // Tue Nov 10
  ]);
});

test("practice: every other week, monthly, one-off and until expansion", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const biweekly = await createPractice(api, bandId, weekly({ interval: 2 }));
  const monthly = await createPractice(api, bandId, {
    startDate: "2026-10-31",
    recurrence: { freq: "monthly", monthlyMode: "dayOfMonth" },
  });
  const nth = await createPractice(api, bandId, {
    startDate: "2026-11-10",
    recurrence: { freq: "monthly", monthlyMode: "nthWeekday" },
  });
  const oneOff = await createPractice(api, bandId, {
    recurrence: { freq: "none" },
  });
  const until = await createPractice(
    api,
    bandId,
    weekly({ end: { type: "until", date: "2026-11-10" } }),
  );
  const ev = await listEvents(api, bandId, WIDE_FROM, "2027-01-20T00:00:00Z");
  const of = (id: string) =>
    ev.filter((e) => e.seriesId === id).map((e) => e.date);

  expect(of(biweekly.id).slice(0, 4)).toEqual([
    "2026-10-27",
    "2026-11-10",
    "2026-11-24",
    "2026-12-08",
  ]);
  // The 31st skips months without one, like Google Calendar.
  expect(of(monthly.id)).toEqual(["2026-10-31", "2026-12-31"]);
  expect(of(nth.id)).toEqual(["2026-11-10", "2026-12-08", "2027-01-12"]);
  expect(of(oneOff.id)).toEqual([FIRST_TUE]);
  expect(ev.find((e) => e.seriesId === oneOff.id)?.recurring).toBe(false);
  expect(of(until.id)).toEqual(["2026-10-27", "2026-11-03", "2026-11-10"]);
});

test("practice: invalid and unsupported recurrence is rejected", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const post = async (data: Json) =>
    (
      await api.post(`/bands/${bandId}/practices`, {
        data: {
          title: "P",
          startDate: FIRST_TUE,
          startTime: "19:00",
          durationMinutes: 60,
          timeZone: NY,
          ...data,
        },
      })
    ).status();
  expect(await post({ recurrence: { freq: "daily" } })).toBe(400);
  expect(await post({ recurrence: { freq: "yearly" } })).toBe(400);
  expect(
    await post({ recurrence: { freq: "monthly", byWeekday: ["TU"] } }),
  ).toBe(400);
  expect(
    await post({ recurrence: { freq: "weekly", monthlyMode: "dayOfMonth" } }),
  ).toBe(400);
  expect(await post({ recurrence: { freq: "weekly", interval: 0 } })).toBe(400);
  expect(
    await post({ recurrence: { freq: "weekly", byWeekday: ["XX"] } }),
  ).toBe(400);
  expect(
    await post({
      recurrence: { freq: "weekly", end: { type: "count", count: 0 } },
    }),
  ).toBe(400);
  expect(
    await post(weekly({ end: { type: "until", date: "2026-10-01" } })),
  ).toBe(400);
  expect(await post({ timeZone: "Nope/Zone" })).toBe(400);
  expect(await post({ durationMinutes: 0 })).toBe(400);
  expect(await post({ startTime: "7pm" })).toBe(400);
  expect(await post({ title: "" })).toBe(400);
  expect(await post({})).toBe(201);
});

test("practice: start date off the weekday list moves to the first match", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  // Tuesday 10-27 start, but only Thursdays requested.
  const s = await createPractice(api, bandId, weekly({ byWeekday: ["TH"] }));
  expect(s.startDate).toBe("2026-10-29");
});

test("practice: get series and occurrence, invalid keys", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(api, bandId, weekly());
  expect(
    (await (await api.get(`/bands/${bandId}/practices/${s.id}`)).json()).id,
  ).toBe(s.id);

  const occ = await (
    await api.get(occPath(bandId, s.id, "20261104T000000Z"))
  ).json();
  expect(occ).toMatchObject({
    seriesId: s.id,
    startsAt: "2026-11-04T00:00:00.000Z",
    durationMinutes: 120,
    myRsvp: "no_response",
    setlistId: null,
    setlistSource: null,
    laterCustomSetlists: [],
  });
  // Wrong time on a real day, malformed key, unknown series.
  for (const key of [
    "20261103T010000Z",
    "2026-11-03",
    "garbage",
    "20261102T000000Z",
  ]) {
    expect((await api.get(occPath(bandId, s.id, key))).status(), key).toBe(404);
  }
  expect(
    (
      await api.get(
        occPath(
          bandId,
          "00000000-0000-4000-8000-000000000000",
          "20261104T000000Z",
        ),
      )
    ).status(),
  ).toBe(404);
});

test("practice: edit this moves one occurrence, cancel excludes it", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(
    api,
    bandId,
    weekly({ end: { type: "count", count: 3 } }),
  );
  const key = "20261104T000000Z"; // Nov 3 19:00 NY

  const res = await api.patch(occPath(bandId, s.id, key), {
    data: {
      scope: "this",
      startDate: "2026-11-05",
      startTime: "20:30",
      durationMinutes: 90,
      location: "Studio B",
      title: "Moved",
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.occurrence).toMatchObject({
    originalStart: "2026-11-04T00:00:00.000Z",
    startsAt: "2026-11-06T01:30:00.000Z",
    endsAt: "2026-11-06T03:00:00.000Z",
    title: "Moved",
    location: "Studio B",
    modified: true,
    date: "2026-11-05",
  });

  let ev = await listEvents(api, bandId);
  expect(starts(ev)).toEqual([
    "2026-10-27T23:00:00.000Z",
    "2026-11-06T01:30:00.000Z",
    "2026-11-11T00:00:00.000Z",
  ]);
  // Still addressable by its original key.
  expect((await api.get(occPath(bandId, s.id, key))).status()).toBe(200);
  // The moved occurrence is found even when only its new slot is in range.
  const narrow = await listEvents(
    api,
    bandId,
    "2026-11-05T12:00:00Z",
    "2026-11-06T12:00:00Z",
  );
  expect(narrow.map((e) => e.occurrenceKey)).toEqual([key]);
  // And is gone from its original slot.
  expect(
    await listEvents(
      api,
      bandId,
      "2026-11-03T12:00:00Z",
      "2026-11-04T12:00:00Z",
    ),
  ).toEqual([]);

  expect(
    (await api.delete(`${occPath(bandId, s.id, key)}?scope=this`)).status(),
  ).toBe(204);
  ev = await listEvents(api, bandId);
  expect(ev.map((e) => e.occurrenceKey)).toEqual([
    "20261027T230000Z",
    "20261111T000000Z",
  ]);
  expect((await api.get(occPath(bandId, s.id, key))).status()).toBe(404);
  // Cancelling again is idempotent.
  expect(
    (await api.delete(`${occPath(bandId, s.id, key)}?scope=this`)).status(),
  ).toBe(204);
  // Series still exists.
  expect((await api.get(`/bands/${bandId}/practices/${s.id}`)).status()).toBe(
    200,
  );
});

test("practice: edit this_and_following splits the series", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(api, bandId, weekly());
  const key = "20261111T000000Z"; // Nov 10 19:00 NY

  const res = await api.patch(occPath(bandId, s.id, key), {
    data: {
      scope: "this_and_following",
      startTime: "20:00",
      title: "Late practice",
      durationMinutes: 60,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.series.id).not.toBe(s.id);
  expect(body.series).toMatchObject({
    title: "Late practice",
    startDate: "2026-11-10",
    startTime: "20:00",
    durationMinutes: 60,
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU",
  });
  expect(body.occurrence).toMatchObject({
    seriesId: body.series.id,
    startsAt: "2026-11-11T01:00:00.000Z",
  });

  const oldSeries = await (
    await api.get(`/bands/${bandId}/practices/${s.id}`)
  ).json();
  expect(oldSeries.rrule).toBe(
    "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261104T000000Z",
  );
  expect(oldSeries.recurrence.end).toEqual({
    type: "until",
    date: "2026-11-03",
  });

  const ev = await listEvents(api, bandId, WIDE_FROM, "2026-11-25T00:00:00Z");
  expect(ev.map((e) => [e.title, e.startsAt, e.endsAt])).toEqual([
    ["Practice", "2026-10-27T23:00:00.000Z", "2026-10-28T01:00:00.000Z"],
    ["Practice", "2026-11-04T00:00:00.000Z", "2026-11-04T02:00:00.000Z"],
    ["Late practice", "2026-11-11T01:00:00.000Z", "2026-11-11T02:00:00.000Z"],
    ["Late practice", "2026-11-18T01:00:00.000Z", "2026-11-18T02:00:00.000Z"],
  ]);
  // The old series no longer answers for split-off occurrences.
  expect((await api.get(occPath(bandId, s.id, key))).status()).toBe(404);
});

test("practice: splitting a counted series divides the count and carries overrides", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(
    api,
    bandId,
    weekly({ end: { type: "count", count: 5 } }),
  );
  // Override and RSVP on the 4th occurrence (Nov 17), before the split.
  const k4 = "20261118T000000Z";
  await api.patch(occPath(bandId, s.id, k4), {
    data: { scope: "this", location: "Elsewhere" },
  });
  await api.put(`${occPath(bandId, s.id, k4)}/rsvp`, {
    data: { status: "going" },
  });

  const res = await (
    await api.patch(occPath(bandId, s.id, "20261111T000000Z"), {
      data: { scope: "this_and_following", location: "New room" },
    })
  ).json();
  expect(res.series.rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3");
  const oldSeries = await (
    await api.get(`/bands/${bandId}/practices/${s.id}`)
  ).json();
  expect(oldSeries.rrule).toBe(
    "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261104T000000Z",
  );

  const ev = await listEvents(api, bandId);
  expect(ev).toHaveLength(5);
  expect(ev.map((e) => e.location)).toEqual([
    null,
    null,
    "New room",
    "Elsewhere",
    "New room",
  ]);
  // The override and RSVP followed the occurrence into the new series.
  const moved = await (
    await api.get(occPath(bandId, res.series.id, k4))
  ).json();
  expect(moved).toMatchObject({
    location: "Elsewhere",
    myRsvp: "going",
    modified: true,
  });
});

test("practice: edit all updates the series; schedule changes clear overrides", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(
    api,
    bandId,
    weekly({ end: { type: "count", count: 3 } }),
  );
  await api.patch(occPath(bandId, s.id, "20261111T000000Z"), {
    data: { scope: "this", title: "One-off name" },
  });

  // Title and location keep overrides.
  const r1 = await (
    await api.patch(occPath(bandId, s.id, "20261111T000000Z"), {
      data: { scope: "all", location: "Basement", durationMinutes: 45 },
    })
  ).json();
  expect(r1.series).toMatchObject({
    id: s.id,
    location: "Basement",
    durationMinutes: 45,
  });
  let ev = await listEvents(api, bandId);
  expect(ev.map((e) => e.title)).toEqual([
    "Practice",
    "Practice",
    "One-off name",
  ]);
  expect(ev.some((e) => e.title === "One-off name")).toBe(true);
  expect(ev.every((e) => e.location === "Basement")).toBe(true);

  // A new start time rebuilds every slot and drops the old overrides.
  const r2 = await (
    await api.patch(occPath(bandId, s.id, "20261027T230000Z"), {
      data: {
        scope: "all",
        startTime: "18:30",
        recurrence: {
          freq: "weekly",
          byWeekday: ["WE"],
          end: { type: "count", count: 2 },
        },
      },
    })
  ).json();
  expect(r2.series).toMatchObject({
    startTime: "18:30",
    startDate: "2026-10-28",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=2",
  });
  ev = await listEvents(api, bandId);
  expect(starts(ev)).toEqual([
    "2026-10-28T22:30:00.000Z",
    "2026-11-04T23:30:00.000Z",
  ]);
  expect(ev.every((e) => !e.modified && e.title === "Practice")).toBe(true);
});

test("practice: delete scopes", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);

  // this_and_following ends the series before the occurrence.
  const a = await createPractice(api, bandId, weekly());
  expect(
    (
      await api.delete(
        `${occPath(bandId, a.id, "20261111T000000Z")}?scope=this_and_following`,
      )
    ).status(),
  ).toBe(204);
  let ev = await listEvents(api, bandId, WIDE_FROM, "2027-02-01T00:00:00Z");
  expect(ev.map((e) => e.date)).toEqual(["2026-10-27", "2026-11-03"]);
  expect(
    (await api.get(occPath(bandId, a.id, "20261111T000000Z"))).status(),
  ).toBe(404);

  // all soft-deletes the series.
  expect(
    (
      await api.delete(`${occPath(bandId, a.id, "20261027T230000Z")}?scope=all`)
    ).status(),
  ).toBe(204);
  expect((await api.get(`/bands/${bandId}/practices/${a.id}`)).status()).toBe(
    404,
  );
  expect(await listEvents(api, bandId)).toEqual([]);

  // this_and_following on the first occurrence removes the whole series.
  const b = await createPractice(api, bandId, weekly());
  expect(
    (
      await api.delete(
        `${occPath(bandId, b.id, "20261027T230000Z")}?scope=this_and_following`,
      )
    ).status(),
  ).toBe(204);
  expect((await api.get(`/bands/${bandId}/practices/${b.id}`)).status()).toBe(
    404,
  );

  // A scope is required.
  const c = await createPractice(api, bandId, weekly());
  expect(
    (await api.delete(occPath(bandId, c.id, "20261027T230000Z"))).status(),
  ).toBe(400);
  expect(
    (
      await api.delete(
        `${occPath(bandId, c.id, "20261027T230000Z")}?scope=bogus`,
      )
    ).status(),
  ).toBe(400);
  ev = await listEvents(api, bandId);
  expect(ev.length).toBeGreaterThan(0);
});

test("practice: scope-specific fields are validated", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const s = await createPractice(api, bandId, weekly());
  const key = "20261027T230000Z";
  const patch = async (data: Json) =>
    (await api.patch(occPath(bandId, s.id, key), { data })).status();
  expect(await patch({ scope: "this", recurrence: { freq: "none" } })).toBe(
    400,
  );
  expect(await patch({ scope: "this", timeZone: "UTC" })).toBe(400);
  expect(
    await patch({ scope: "this_and_following", startDate: "2026-11-01" }),
  ).toBe(400);
  expect(await patch({ title: "no scope" })).toBe(400);
  expect(await patch({ scope: "this", title: "" })).toBe(400);
  expect(await patch({ scope: "all", timeZone: "Nope/Zone" })).toBe(400);
});

// ---------------------------------------------------------------- RSVPs

test("rsvp: per-user status and attendee ordering", async ({ testApi, db }) => {
  const a = await newBand(testApi);
  const names = ["b", "c", "d", "e"];
  const others: Record<string, Awaited<ReturnType<typeof client>>> = {};
  for (const n of names) {
    const c = await client(testApi, `${n}@example.com`);
    others[n] = c;
    await db
      .insert(memberships)
      .values({ bandId: a.bandId, userId: c.user.id, role: "member" });
  }
  // e leaves the band: not an attendee.
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.userId, others["e"]!.user.id));

  const s = await createPractice(a.api, a.bandId, weekly());
  const path = occPath(a.bandId, s.id, "20261027T230000Z");
  const put = (api: Api, status: string) =>
    api.put(`${path}/rsvp`, { data: { status } });

  expect((await put(a.api, "going")).status()).toBe(200);
  expect((await put(others["b"]!.api, "not_going")).status()).toBe(200);
  expect((await put(others["c"]!.api, "maybe")).status()).toBe(200);
  expect((await put(a.api, "bogus")).status()).toBe(400);

  const occ = await (await a.api.get(path)).json();
  expect(occ.attendees.map((x: Json) => x.status)).toEqual([
    "going",
    "maybe",
    "no_response",
    "not_going",
  ]);
  expect(occ.attendees.map((x: Json) => x.userId)).toContain(a.user.id);
  expect(occ.attendees.map((x: Json) => x.userId)).not.toContain(
    others["e"]!.user.id,
  );
  expect(occ.myRsvp).toBe("going");

  // Changing a response replaces it; reading as another user shows their own.
  const after = await (await put(a.api, "not_going")).json();
  expect(after.myRsvp).toBe("not_going");
  expect(after.attendees.map((x: Json) => x.status)).toEqual([
    "maybe",
    "no_response",
    "not_going",
    "not_going",
  ]);
  const asC = await (await others["c"]!.api.get(path)).json();
  expect(asC.myRsvp).toBe("maybe");

  // Cancelled or invalid occurrences cannot be RSVPed to.
  await a.api.delete(`${path}?scope=this`);
  expect((await put(a.api, "going")).status()).toBe(404);
  expect((await put(a.api, "going")).status()).toBe(404);
  // A non-member cannot.
  const out = await client(testApi, "out@example.com");
  expect((await put(out.api, "going")).status()).toBe(404);
});

// ---------------------------------------------------------------- setlists

test("setlist assignment: single beats forward, latest forward wins, conflicts flagged", async ({
  testApi,
  db,
}) => {
  const { api, bandId } = await newBand(testApi);
  const mk = async () =>
    (await db.insert(setlists).values({ bandId }).returning())[0]!.id;
  const [A, B, C] = [await mk(), await mk(), await mk()] as [
    string,
    string,
    string,
  ];

  const s = await createPractice(api, bandId, weekly());
  const k = [
    "20261027T230000Z",
    "20261104T000000Z",
    "20261111T000000Z",
    "20261118T000000Z",
  ];
  const put = (i: number, data: Json) =>
    api.put(`${occPath(bandId, s.id, k[i]!)}/setlist`, { data });
  const read = async (i: number) =>
    (await (await api.get(occPath(bandId, s.id, k[i]!))).json()) as Json;
  const sources = async () => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const o = await read(i);
      out.push([o.setlistId, o.setlistSource]);
    }
    return out;
  };

  // A custom setlist on the third occurrence only.
  let r = await (await put(2, { setlistId: A, scope: "this" })).json();
  expect(r).toMatchObject({ setlistId: A, source: "single", conflicts: [] });
  expect(await sources()).toEqual([
    [null, null],
    [null, null],
    [A, "single"],
    [null, null],
  ]);

  // Forward from the second, keeping the custom one.
  r = await (
    await put(1, {
      setlistId: B,
      scope: "this_and_following",
      onConflict: "keep",
    })
  ).json();
  expect(r).toMatchObject({
    setlistId: B,
    source: "forward",
    conflictsReplaced: false,
  });
  expect(r.conflicts.map((c: Json) => [c.occurrenceKey, c.setlistId])).toEqual([
    [k[2], A],
  ]);
  expect(await sources()).toEqual([
    [null, null],
    [B, "forward"],
    [A, "single"],
    [B, "forward"],
  ]);
  expect(
    (await read(1)).laterCustomSetlists.map((c: Json) => c.occurrenceKey),
  ).toEqual([k[2]]);
  expect((await read(3)).laterCustomSetlists).toEqual([]);

  // Forward again from the second, replacing (the default).
  r = await (
    await put(1, { setlistId: C, scope: "this_and_following" })
  ).json();
  expect(r).toMatchObject({ setlistId: C, conflictsReplaced: true });
  expect(r.conflicts).toHaveLength(1);
  expect(await sources()).toEqual([
    [null, null],
    [C, "forward"],
    [C, "forward"],
    [C, "forward"],
  ]);

  // A later forward row takes over from its own occurrence; earlier ones keep theirs.
  await put(3, { setlistId: A, scope: "this_and_following" });
  expect(await sources()).toEqual([
    [null, null],
    [C, "forward"],
    [C, "forward"],
    [A, "forward"],
  ]);
  // Forward from the first covers everything before the later forward row too.
  await put(0, { setlistId: B, scope: "this_and_following" });
  expect(await sources()).toEqual([
    [B, "forward"],
    [B, "forward"],
    [B, "forward"],
    [B, "forward"],
  ]);

  // Unknown setlist and foreign-band setlists are rejected.
  expect(
    (
      await put(0, {
        setlistId: "00000000-0000-4000-8000-000000000001",
        scope: "this",
      })
    ).status(),
  ).toBe(404);
  const other = await client(testApi, "other@example.com");
  const otherBand = await (
    await other.api.post("/bands", { data: { name: "Other" } })
  ).json();
  const foreign = (
    await db.insert(setlists).values({ bandId: otherBand.id }).returning()
  )[0]!.id;
  expect((await put(0, { setlistId: foreign, scope: "this" })).status()).toBe(
    404,
  );
  expect((await put(0, { setlistId: A, scope: "all" })).status()).toBe(400);
});

test("setlist assignment survives a series split", async ({ testApi, db }) => {
  const { api, bandId } = await newBand(testApi);
  const A = (await db.insert(setlists).values({ bandId }).returning())[0]!.id;
  const s = await createPractice(api, bandId, weekly());
  await api.put(`${occPath(bandId, s.id, "20261027T230000Z")}/setlist`, {
    data: { setlistId: A, scope: "this_and_following" },
  });
  const res = await (
    await api.patch(occPath(bandId, s.id, "20261118T000000Z"), {
      data: { scope: "this_and_following", location: "Annex" },
    })
  ).json();
  const o = await (
    await api.get(occPath(bandId, res.series.id, "20261118T000000Z"))
  ).json();
  expect(o).toMatchObject({
    setlistId: A,
    setlistSource: "forward",
    location: "Annex",
  });
  const early = await (
    await api.get(occPath(bandId, s.id, "20261104T000000Z"))
  ).json();
  expect(early).toMatchObject({ setlistId: A, setlistSource: "forward" });
});

// ---------------------------------------------------------------- listing

test("events list: merged, ordered, typed, with all-day and untimed gigs", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const gig = (data: Json) =>
    api
      .post(`/bands/${bandId}/gigs`, { data: { timeZone: NY, ...data } })
      .then((r) => r.json());
  const timed = await gig({
    title: "Timed",
    date: "2026-10-27",
    startTime: "21:00",
  });
  const untimed = await gig({ title: "TBD time", date: "2026-10-27" });
  const allDay = await gig({
    title: "Festival",
    date: "2026-10-27",
    allDay: true,
  });
  const outside = await gig({
    title: "Next month",
    date: "2026-12-25",
    startTime: "20:00",
  });
  const s = await createPractice(
    api,
    bandId,
    weekly({ end: { type: "count", count: 1 } }),
  );

  const day = await listEvents(
    api,
    bandId,
    "2026-10-27T04:00:00Z",
    "2026-10-28T04:00:00Z",
  );
  // Untimed and all-day gigs lead their day; the practice (19:00) precedes the 21:00 gig.
  expect(day.map((e) => e.title).sort()).toEqual([
    "Festival",
    "Practice",
    "TBD time",
    "Timed",
  ]);
  expect(day.map((e) => e.title).slice(-2)).toEqual(["Practice", "Timed"]);
  expect(day.slice(0, 2).map((e) => e.allDay || e.startsAt === null)).toEqual([
    true,
    true,
  ]);
  expect(day.find((e) => e.id === timed.id)).toMatchObject({
    type: "gig",
    date: "2026-10-27",
    startsAt: "2026-10-28T01:00:00.000Z",
    timeZone: NY,
  });
  expect(day.find((e) => e.id === untimed.id)).toMatchObject({
    startsAt: null,
    allDay: false,
  });
  expect(day.find((e) => e.id === allDay.id)).toMatchObject({ allDay: true });
  expect(day.find((e) => e.type === "practice")?.seriesId).toBe(s.id);

  const all = await listEvents(api, bandId);
  expect(all.at(-1)?.id).toBe(outside.id);
  expect(all).toHaveLength(5);

  expect(
    (await listEvents(api, bandId, WIDE_FROM, WIDE_TO, "gig")).every(
      (e) => e.type === "gig",
    ),
  ).toBe(true);
  const practices = await listEvents(
    api,
    bandId,
    WIDE_FROM,
    WIDE_TO,
    "practice",
  );
  expect(practices.map((e) => e.type)).toEqual(["practice"]);

  // A gig on another local day is excluded when the range ends first.
  const before = await listEvents(
    api,
    bandId,
    "2026-10-26T00:00:00Z",
    "2026-10-27T04:00:00Z",
  );
  expect(before.map((e) => e.title)).toEqual([]);
});

test("events list: range validation", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const get = (params: Json) => api.get(`/bands/${bandId}/events`, { params });
  expect((await get({ from: WIDE_FROM })).status()).toBe(400);
  expect((await get({ from: "yesterday", to: WIDE_TO })).status()).toBe(400);
  expect((await get({ from: WIDE_TO, to: WIDE_FROM })).status()).toBe(400);
  expect((await get({ from: WIDE_FROM, to: WIDE_FROM })).status()).toBe(400);
  expect(
    (await get({ from: WIDE_FROM, to: WIDE_TO, type: "party" })).status(),
  ).toBe(400);
  // Exactly 400 days is fine; 401 is not.
  expect(
    (
      await get({ from: "2026-01-01T00:00:00Z", to: "2027-02-05T00:00:00Z" })
    ).status(),
  ).toBe(200);
  expect(
    (
      await get({ from: "2026-01-01T00:00:00Z", to: "2027-02-06T00:00:00Z" })
    ).status(),
  ).toBe(400);
  // Offsets are honoured.
  expect(
    (
      await get({
        from: "2026-10-01T00:00:00-04:00",
        to: "2026-10-02T00:00:00-04:00",
      })
    ).status(),
  ).toBe(200);
});

// ---------------------------------------------------------------- places

test("places: autocomplete and details through the adapter", async ({
  testApi,
}) => {
  const { api, bandId } = await newBand(testApi);
  const ac = await api.get(`/bands/${bandId}/places/autocomplete`, {
    params: { q: "bowery" },
  });
  expect(ac.status()).toBe(200);
  expect(await ac.json()).toEqual([
    {
      placeId: "fake-place-bowery",
      description: "Bowery Ballroom, 6 Delancey St, New York, NY 10002, USA",
    },
  ]);
  const det = await api.get(`/bands/${bandId}/places/fake-place-bowery`);
  expect(det.status()).toBe(200);
  expect(await det.json()).toMatchObject({
    placeId: "fake-place-bowery",
    name: "Bowery Ballroom",
    lat: 40.7204,
  });
  expect((await api.get(`/bands/${bandId}/places/nope`)).status()).toBe(404);
  expect((await api.get(`/bands/${bandId}/places/autocomplete`)).status()).toBe(
    400,
  );
  expect(
    (await api.get(`/bands/${bandId}/places/autocomplete?q=`)).status(),
  ).toBe(400);
});

test("places: rate limited per user", async ({ testApi }) => {
  const { api, bandId } = await newBand(testApi);
  const codes: number[] = [];
  for (let i = 0; i < 35; i++) {
    codes.push(
      (
        await api.get(`/bands/${bandId}/places/autocomplete`, {
          params: { q: "a" },
        })
      ).status(),
    );
  }
  expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
  expect(codes.slice(30)).toContain(429);
  // Another user is unaffected.
  const other = await client(testApi, "other@example.com");
  const ob = await (
    await other.api.post("/bands", { data: { name: "Other" } })
  ).json();
  expect(
    (
      await other.api.get(`/bands/${ob.id}/places/autocomplete`, {
        params: { q: "a" },
      })
    ).status(),
  ).toBe(200);
});
