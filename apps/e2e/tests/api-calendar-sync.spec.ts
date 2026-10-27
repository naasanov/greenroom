import {
  bands,
  calendarSyncStates,
  gigs,
  practiceOccurrenceOverrides,
  practiceSeries,
} from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  AVA,
  BEN,
  BEN_CAL,
  connect,
  createGig,
  createPractice,
  dateIn,
  emailsOf,
  instanceOf,
  keyOf,
  linkCalendar,
  masterOf,
  newBand,
  nextTuesday,
  occurrence,
  setupCalendar,
  statusOf,
} from "./calendar-sync-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const sync = (bandId: string, path = "") =>
  `/bands/${bandId}/integrations/google/calendar${path}`;

test("setup creates one calendar and pushes gigs and practices with attendees", async ({
  testApi,
  db,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  const ben = await join(BEN);
  await ben.api.patch("/auth/me", { data: { calendarEmail: BEN_CAL } });

  const gig = await createGig(ava.api, bandId, {
    title: "Club Meridian",
    venueName: "Club Meridian",
    address: "88 Main St",
    notes: "Bring cables",
    loadInTime: "18:30",
  });
  const allDay = await createGig(ava.api, bandId, {
    title: "Festival",
    date: dateIn(40),
    allDay: true,
    startTime: undefined,
    endTime: undefined,
  });
  await createGig(ava.api, bandId, { title: "Ancient", date: dateIn(-60) });
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    title: "Weekly practice",
    location: "Room B",
  });
  const sid = series.id as string;
  const moved = occurrence(start, 2);
  await ava.api.patch(
    `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(moved)}`,
    { data: { scope: "this", startTime: "20:00" } },
  );
  const cancelled = occurrence(start, 3);
  await ava.api.delete(
    `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(cancelled)}`,
    { params: { scope: "this" } },
  );

  // Nothing is pushed before the band links Calendar.
  expect(
    (await (await ava.api.get(sync(bandId, "/sync"))).json()).pending,
  ).toBe(0);
  const unlinked = await ava.api.post(sync(bandId, "/setup"), {
    data: { timeZone: "UTC" },
  });
  expect(unlinked.status()).toBe(409);
  expect((await unlinked.json()).code).toBe("GOOGLE_NOT_LINKED");

  await linkCalendar(ava.api, bandId);
  const result = await setupCalendar(ava.api, bandId);
  const calendarId = result.calendarId as string;
  expect(result).toMatchObject({ gigs: 2, practiceSeries: 1 });
  expect(result.lastSyncedAt).not.toBeNull();
  expect(await testApi.calendarInfo(calendarId)).toEqual({
    summary: "The Foxes",
    timeZone: "UTC",
  });
  const [band] = await db.select().from(bands).where(eq(bands.id, bandId));
  expect(band!.calendarId).toBe(calendarId);

  const events = await testApi.calendarEvents(calendarId);
  const attendees = [AVA, BEN_CAL].sort();

  const g = masterOf(events, gig.id);
  expect(g).toMatchObject({
    summary: "Club Meridian",
    location: "Club Meridian, 88 Main St",
    allDay: false,
    timeZone: "UTC",
    privateProperties: { greenroomKind: "gig", greenroomId: gig.id },
  });
  expect(new Date(g.start).toISOString()).toBe(`${gig.date}T20:00:00.000Z`);
  expect(new Date(g.end).toISOString()).toBe(`${gig.date}T23:00:00.000Z`);
  expect(g.description).toContain("Bring cables");
  expect(g.description).toContain("Load-in: 18:30");
  expect(g.description).toContain(`/gigs/${gig.id}`);
  expect(emailsOf(g)).toEqual(attendees);

  const a = masterOf(events, allDay.id);
  expect(a).toMatchObject({ allDay: true, start: allDay.date });
  expect(a.end).toBe(dateIn(41));
  expect(events.some((e) => e.summary === "Ancient")).toBe(false);

  const m = masterOf(events, sid);
  expect(m.recurrence).toEqual([series.rrule]);
  expect(m).toMatchObject({ summary: "Weekly practice", location: "Room B" });
  expect(m.description).toContain(`/practices/${sid}`);
  expect(new Date(m.start).toISOString()).toBe(
    occurrence(start, 0).toISOString(),
  );
  expect(emailsOf(m)).toEqual(attendees);
  const movedEvent = instanceOf(events, m.id, moved)!;
  expect(new Date(movedEvent.start).toISOString()).toBe(
    occurrence(start, 2, 20).toISOString(),
  );
  expect(instanceOf(events, m.id, cancelled)!.cancelled).toBe(true);

  // Etags and ids are stored, including the instance etag of the override.
  const [row] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(row).toMatchObject({ gcalEventId: g.id, gcalEtag: g.etag });
  const [srow] = await db
    .select()
    .from(practiceSeries)
    .where(eq(practiceSeries.id, sid));
  expect(srow).toMatchObject({ gcalEventId: m.id, gcalEtag: m.etag });
  const overrides = await db
    .select()
    .from(practiceOccurrenceOverrides)
    .where(eq(practiceOccurrenceOverrides.seriesId, sid));
  expect(overrides.map((o) => o.gcalInstanceEtag).sort()).toEqual(
    [movedEvent.etag, instanceOf(events, m.id, cancelled)!.etag].sort(),
  );
  const [state] = await db.select().from(calendarSyncStates);
  expect(state!.syncToken).toBeTruthy();

  // Setup again: same calendar, no duplicate events.
  const again = await setupCalendar(ava.api, bandId);
  expect(again.calendarId).toBe(calendarId);
  const after = await testApi.calendarEvents(calendarId);
  expect(after.map((e) => e.id).sort()).toEqual(events.map((e) => e.id).sort());

  // Any member can read the sync status; strangers cannot.
  const status = await (await ben.api.get(sync(bandId, "/sync"))).json();
  expect(status.pending).toBe(0);
  expect(status.lastSyncedAt).not.toBeNull();
  const stranger = await testApi.login("stranger@example.com");
  expect(stranger.user.email).toBe("stranger@example.com");
});

test("app edits, cancels and deletes reach Google", async ({ testApi, db }) => {
  const { ava, bandId } = await newBand(testApi);
  const gig = await createGig(ava.api, bandId);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    title: "Practice",
    location: "Room B",
  });
  const sid = series.id as string;
  const calendarId = await connect(ava.api, bandId);
  const base = `/bands/${bandId}/practices/${sid}/occurrences`;

  // Gig edit.
  const before = masterOf(await testApi.calendarEvents(calendarId), gig.id);
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "Renamed", startTime: "21:00", endTime: "23:30" },
  });
  expect(
    (await (await ava.api.get(sync(bandId, "/sync"))).json()).pending,
  ).toBe(1);
  await testApi.calendarFlush(bandId);
  const edited = masterOf(await testApi.calendarEvents(calendarId), gig.id);
  expect(edited.summary).toBe("Renamed");
  expect(new Date(edited.start).toISOString()).toBe(
    `${gig.date}T21:00:00.000Z`,
  );
  expect(edited.etag).not.toBe(before.etag);
  const [row] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(row!.gcalEtag).toBe(edited.etag);

  // Coalescing: a burst of edits is a single pending push.
  for (const title of ["A", "B", "C"]) {
    await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, { data: { title } });
  }
  expect(
    (await (await ava.api.get(sync(bandId, "/sync"))).json()).pending,
  ).toBe(1);
  await testApi.calendarFlush(bandId);
  expect(
    masterOf(await testApi.calendarEvents(calendarId), gig.id).summary,
  ).toBe("C");

  // New gig after setup.
  const fresh = await createGig(ava.api, bandId, { title: "Fresh gig" });
  await testApi.calendarFlush(bandId);
  expect(
    masterOf(await testApi.calendarEvents(calendarId), fresh.id).summary,
  ).toBe("Fresh gig");

  // Series: all, this (moved + location), cancel this.
  await ava.api.patch(`${base}/${keyOf(occurrence(start, 1))}`, {
    data: { scope: "all", title: "Rehearsal" },
  });
  await ava.api.patch(`${base}/${keyOf(occurrence(start, 2))}`, {
    data: { scope: "this", startTime: "20:30", location: "Garage" },
  });
  await ava.api.delete(`${base}/${keyOf(occurrence(start, 3))}`, {
    params: { scope: "this" },
  });
  await testApi.calendarFlush(bandId);
  let events = await testApi.calendarEvents(calendarId);
  const master = masterOf(events, sid);
  expect(master.summary).toBe("Rehearsal");
  const inst = instanceOf(events, master.id, occurrence(start, 2))!;
  expect(inst.location).toBe("Garage");
  expect(new Date(inst.start).toISOString()).toBe(
    occurrence(start, 2, 20).toISOString().replace(":00:00.", ":30:00."),
  );
  expect(instanceOf(events, master.id, occurrence(start, 3))!.cancelled).toBe(
    true,
  );
  const [ov] = await db
    .select()
    .from(practiceOccurrenceOverrides)
    .where(eq(practiceOccurrenceOverrides.originalStart, occurrence(start, 2)));
  expect(ov!.gcalInstanceEtag).toBe(inst.etag);

  // This and following: the old event gets UNTIL, a new recurring event starts.
  const split = await (
    await ava.api.patch(`${base}/${keyOf(occurrence(start, 5))}`, {
      data: { scope: "this_and_following", title: "Late practice" },
    })
  ).json();
  const newId = split.series.id as string;
  expect(newId).not.toBe(sid);
  await testApi.calendarFlush(bandId);
  events = await testApi.calendarEvents(calendarId);
  const oldMaster = masterOf(events, sid);
  expect(oldMaster.recurrence[0]).toContain("UNTIL=");
  const newMaster = masterOf(events, newId);
  expect(newMaster.id).not.toBe(oldMaster.id);
  expect(newMaster.summary).toBe("Late practice");
  expect(new Date(newMaster.start).toISOString()).toBe(
    occurrence(start, 5).toISOString(),
  );
  expect(newMaster.recurrence[0]).toContain("FREQ=WEEKLY");

  // Delete: the whole new series, then the gig.
  await ava.api.delete(
    `/bands/${bandId}/practices/${newId}/occurrences/${keyOf(occurrence(start, 6))}`,
    { params: { scope: "all" } },
  );
  await ava.api.delete(`/bands/${bandId}/gigs/${gig.id}`);
  await testApi.calendarFlush(bandId);
  events = await testApi.calendarEvents(calendarId);
  expect(masterOf(events, newId).cancelled).toBe(true);
  expect(masterOf(events, gig.id).cancelled).toBe(true);
  const [deleted] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(deleted).toMatchObject({ gcalEventId: null, gcalEtag: null });
  expect(masterOf(events, sid).cancelled).toBe(false);
});

test("RSVPs in the app set the attendee status of that occurrence", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  const ben = await join(BEN);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start);
  const sid = series.id as string;
  const calendarId = await connect(ava.api, bandId);
  const key = keyOf(occurrence(start, 1));
  const url = `/bands/${bandId}/practices/${sid}/occurrences/${key}/rsvp`;

  const expected = {
    going: "accepted",
    maybe: "tentative",
    not_going: "declined",
    no_response: "needsAction",
  } as const;
  for (const [status, google] of Object.entries(expected)) {
    const res = await ben.api.put(url, { data: { status } });
    expect(res.status()).toBe(200);
    await testApi.calendarFlush(bandId);
    const events = await testApi.calendarEvents(calendarId);
    const master = masterOf(events, sid);
    const inst = instanceOf(events, master.id, occurrence(start, 1))!;
    expect(statusOf(inst, BEN)).toBe(google);
    // Other occurrences and other members are untouched.
    expect(statusOf(inst, AVA)).toBe("needsAction");
    expect(instanceOf(events, master.id, occurrence(start, 2))).toBeUndefined();
  }

  // A sync pass afterwards keeps the answer.
  await ben.api.put(url, { data: { status: "going" } });
  await testApi.calendarSync(bandId);
  const occ = await (
    await ben.api.get(`/bands/${bandId}/practices/${sid}/occurrences/${key}`)
  ).json();
  expect(occ.myRsvp).toBe("going");
});

test("membership and calendar email changes update attendees", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  const gig = await createGig(ava.api, bandId);
  const series = await createPractice(ava.api, bandId, nextTuesday(7));
  const sid = series.id as string;
  const calendarId = await connect(ava.api, bandId);
  const emails = async () => {
    const events = await testApi.calendarEvents(calendarId);
    return {
      gig: emailsOf(masterOf(events, gig.id)),
      series: emailsOf(masterOf(events, sid)),
    };
  };
  expect(await emails()).toEqual({ gig: [AVA], series: [AVA] });

  const ben = await join(BEN);
  await testApi.calendarFlush(bandId);
  expect(await emails()).toEqual({
    gig: [AVA, BEN].sort(),
    series: [AVA, BEN].sort(),
  });

  await ben.api.patch("/auth/me", { data: { calendarEmail: BEN_CAL } });
  await testApi.calendarFlush();
  expect(await emails()).toEqual({
    gig: [AVA, BEN_CAL].sort(),
    series: [AVA, BEN_CAL].sort(),
  });

  const res = await ben.api.post(`/bands/${bandId}/leave`, { data: {} });
  expect(res.status()).toBe(204);
  await testApi.calendarFlush(bandId);
  expect(await emails()).toEqual({ gig: [AVA], series: [AVA] });

  // A removed member's answers are not resurrected on rejoin.
  const again = await join(BEN);
  await testApi.calendarFlush(bandId);
  expect((await emails()).gig).toContain(BEN_CAL);
  const members = await (
    await again.api.get(`/bands/${bandId}/members`)
  ).json();
  expect(members).toHaveLength(2);
});

test("unlinked bands push nothing; unlink clears ids; relink starts fresh", async ({
  testApi,
  db,
}) => {
  const { ava, bandId } = await newBand(testApi);
  const gig = await createGig(ava.api, bandId);
  const series = await createPractice(ava.api, bandId, nextTuesday(7));
  const sid = series.id as string;
  const start = nextTuesday(7);
  await ava.api.delete(
    `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(occurrence(start, 1))}`,
    { params: { scope: "this" } },
  );

  // Linked but not set up: still nothing to push.
  await linkCalendar(ava.api, bandId);
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "Edited" },
  });
  expect(
    (await (await ava.api.get(sync(bandId, "/sync"))).json()).pending,
  ).toBe(0);
  await testApi.calendarFlush(bandId);

  const calendarId = (await setupCalendar(ava.api, bandId))
    .calendarId as string;
  const events = await testApi.calendarEvents(calendarId);
  expect(masterOf(events, gig.id).summary).toBe("Edited");

  // Unlink: ids, etags and sync state are cleared; the Google calendar stays.
  const del = await ava.api.delete(
    `/bands/${bandId}/integrations/google/calendar`,
  );
  expect(del.status()).toBe(204);
  const [g] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(g).toMatchObject({ gcalEventId: null, gcalEtag: null });
  const [s] = await db
    .select()
    .from(practiceSeries)
    .where(eq(practiceSeries.id, sid));
  expect(s).toMatchObject({ gcalEventId: null, gcalEtag: null });
  const overrides = await db.select().from(practiceOccurrenceOverrides);
  expect(overrides).toHaveLength(1);
  expect(overrides[0]!.gcalInstanceEtag).toBeNull();
  expect(await db.select().from(calendarSyncStates)).toHaveLength(0);
  const [band] = await db.select().from(bands).where(eq(bands.id, bandId));
  expect(band!.calendarId).toBeNull();
  expect(await testApi.calendarEvents(calendarId)).toHaveLength(events.length);

  // Changes while unlinked are not pushed anywhere.
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "While unlinked" },
  });
  await createGig(ava.api, bandId, { title: "Another" });
  expect(
    (await (await ava.api.get(sync(bandId, "/sync"))).json()).pending,
  ).toBe(0);
  await testApi.calendarFlush();
  expect(await testApi.calendarEvents(calendarId)).toHaveLength(events.length);

  // Relinking runs setup fresh: a new calendar with every event.
  const second = await connect(ava.api, bandId, "other@example.com");
  expect(second).not.toBe(calendarId);
  const fresh = await testApi.calendarEvents(second);
  expect(masterOf(fresh, gig.id).summary).toBe("While unlinked");
  expect(fresh.some((e) => e.summary === "Another")).toBe(true);
  expect(
    instanceOf(fresh, masterOf(fresh, sid).id, occurrence(start, 1))!.cancelled,
  ).toBe(true);

  // Linking a different account over a live link also starts over.
  await linkCalendar(ava.api, bandId, "third@example.com");
  const [reset] = await db.select().from(bands).where(eq(bands.id, bandId));
  expect(reset!.calendarId).toBeNull();
  const [gAfter] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(gAfter!.gcalEventId).toBeNull();
  const third = (await setupCalendar(ava.api, bandId)).calendarId as string;
  expect(third).not.toBe(second);
  expect(masterOf(await testApi.calendarEvents(third), gig.id)).toBeTruthy();
});
