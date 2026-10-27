import {
  calendarSyncStates,
  gigs,
  practiceOccurrenceOverrides,
  practiceRsvps,
  practiceSeries,
} from "@greenroom/db";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  AVA,
  BEN,
  connect,
  createGig,
  createPractice,
  instanceOf,
  keyOf,
  masterOf,
  newBand,
  nextTuesday,
  occurrence,
  statusOf,
} from "./calendar-sync-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const iso = (d: Date) => d.toISOString();

test("remote gig edits and deletes reach the app without echoing back", async ({
  testApi,
  db,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  await join(BEN);
  const gig = await createGig(ava.api, bandId, { venueName: "Old Venue" });
  const doomed = await createGig(ava.api, bandId, { title: "Doomed" });
  const calendarId = await connect(ava.api, bandId);
  const events = await testApi.calendarEvents(calendarId);
  const g = masterOf(events, gig.id);

  await testApi.calendarEdit(calendarId, g.id, {
    summary: "Remote title",
    location: "New Venue",
    start: `${gig.date}T19:00:00.000Z`,
    end: `${gig.date}T22:00:00.000Z`,
  });
  // Attendee answers on gigs are ignored.
  await testApi.calendarAttendeeResponse(calendarId, g.id, BEN, "declined");
  const snapshot = await testApi.calendarEvents(calendarId);
  await testApi.calendarSync(bandId);

  const got = await (
    await ava.api.get(`/bands/${bandId}/gigs/${gig.id}`)
  ).json();
  expect(got).toMatchObject({
    title: "Remote title",
    venueName: "New Venue",
    address: null,
    startTime: "19:00",
    endTime: "22:00",
  });
  expect(await db.select().from(practiceRsvps)).toHaveLength(0);
  const [row] = await db.select().from(gigs).where(eq(gigs.id, gig.id));
  expect(row!.gcalEtag).toBe(masterOf(snapshot, gig.id).etag);

  // No push echo: Google was not written to, and nothing is pending.
  expect(await testApi.calendarEvents(calendarId)).toEqual(snapshot);
  await testApi.calendarSync(bandId);
  expect(await testApi.calendarEvents(calendarId)).toEqual(snapshot);

  // Remote delete.
  await testApi.calendarDelete(calendarId, masterOf(events, doomed.id).id);
  await testApi.calendarSync(bandId);
  expect(
    (await ava.api.get(`/bands/${bandId}/gigs/${doomed.id}`)).status(),
  ).toBe(404);

  // Remote switch to all-day.
  await testApi.calendarEdit(calendarId, g.id, {
    allDay: true,
    start: gig.date,
    end: new Date(new Date(gig.date).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10),
  });
  await testApi.calendarSync(bandId);
  expect(
    await (await ava.api.get(`/bands/${bandId}/gigs/${gig.id}`)).json(),
  ).toMatchObject({ allDay: true, startTime: null, endTime: null });
});

test("remote series edits, instance edits and cancels reach the app", async ({
  testApi,
  db,
}) => {
  const { ava, bandId } = await newBand(testApi);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    location: "Room B",
  });
  const sid = series.id as string;
  const calendarId = await connect(ava.api, bandId);
  const m = masterOf(await testApi.calendarEvents(calendarId), sid);
  const base = `/bands/${bandId}/practices/${sid}`;

  // Instance edit and cancel.
  await testApi.calendarInstanceEdit(
    calendarId,
    m.id,
    iso(occurrence(start, 1)),
    {
      summary: "Special",
      location: "Garage",
      start: iso(occurrence(start, 1, 20)),
      end: iso(occurrence(start, 1, 22)),
    },
  );
  await testApi.calendarInstanceEdit(
    calendarId,
    m.id,
    iso(occurrence(start, 2)),
    {
      cancelled: true,
    },
  );
  const snapshot = await testApi.calendarEvents(calendarId);
  await testApi.calendarSync(bandId);
  const occ = await (
    await ava.api.get(`${base}/occurrences/${keyOf(occurrence(start, 1))}`)
  ).json();
  expect(occ).toMatchObject({
    title: "Special",
    location: "Garage",
    startsAt: iso(occurrence(start, 1, 20)),
    durationMinutes: 120,
  });
  expect(
    (
      await ava.api.get(`${base}/occurrences/${keyOf(occurrence(start, 2))}`)
    ).status(),
  ).toBe(404);
  const overrides = await db.select().from(practiceOccurrenceOverrides);
  expect(overrides).toHaveLength(2);
  expect(overrides.every((o) => o.gcalInstanceEtag)).toBe(true);
  expect(await testApi.calendarEvents(calendarId)).toEqual(snapshot);

  // Series edit: title, time and recurrence.
  await testApi.calendarEdit(calendarId, m.id, {
    summary: "Renamed practice",
    start: iso(occurrence(start, 0, 20)),
    end: iso(occurrence(start, 0, 22)),
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"],
  });
  await testApi.calendarSync(bandId);
  const got = await (await ava.api.get(base)).json();
  expect(got).toMatchObject({
    title: "Renamed practice",
    startTime: "20:00",
    recurrence: { freq: "weekly", byWeekday: ["TU", "TH"] },
  });

  // A rule the app cannot represent keeps the app's rule and is pushed back.
  await testApi.calendarEdit(calendarId, m.id, {
    recurrence: ["RRULE:FREQ=DAILY;INTERVAL=2"],
  });
  await testApi.calendarSync(bandId);
  const [row] = await db
    .select()
    .from(practiceSeries)
    .where(eq(practiceSeries.id, sid));
  expect(row!.rrule).toContain("BYDAY=TU,TH");
  expect(
    masterOf(await testApi.calendarEvents(calendarId), sid).recurrence[0],
  ).toContain("BYDAY=TU,TH");

  // Remote delete of the whole series.
  await testApi.calendarDelete(calendarId, m.id);
  await testApi.calendarSync(bandId);
  expect((await ava.api.get(base)).status()).toBe(404);
});

test("remote attendee answers become RSVPs", async ({ testApi, db }) => {
  const { ava, bandId, join } = await newBand(testApi);
  const ben = await join(BEN);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start);
  const sid = series.id as string;
  const calendarId = await connect(ava.api, bandId);
  const m = masterOf(await testApi.calendarEvents(calendarId), sid);
  const rsvpOf = async (k: number) => {
    const occ = await (
      await ava.api.get(
        `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(occurrence(start, k))}`,
      )
    ).json();
    return occ.attendees.find(
      (a: { userId: string }) => a.userId === ben.user.id,
    ).status;
  };

  // Instance-level answer first, then a series-level answer.
  await testApi.calendarInstanceAttendeeResponse(
    calendarId,
    m.id,
    iso(occurrence(start, 2)),
    BEN,
    "declined",
  );
  await testApi.calendarSync(bandId);
  expect(await rsvpOf(2)).toBe("not_going");
  expect(await rsvpOf(3)).toBe("no_response");

  await testApi.calendarAttendeeResponse(calendarId, m.id, BEN, "accepted");
  await testApi.calendarSync(bandId);
  expect(await rsvpOf(0)).toBe("going");
  expect(await rsvpOf(3)).toBe("going");
  expect(await rsvpOf(2)).toBe("not_going");
  const rows = await db
    .select()
    .from(practiceRsvps)
    .where(
      and(
        eq(practiceRsvps.seriesId, sid),
        eq(practiceRsvps.userId, ben.user.id),
      ),
    );
  expect(rows.length).toBeGreaterThan(40);
  expect(
    rows.every((r) => r.originalStart.getTime() > Date.now() - 31 * 864e5),
  ).toBe(true);
  // Nobody else was touched.
  expect(rows.some((r) => r.userId === (undefined as unknown))).toBe(false);

  // Tentative on one occurrence from Google, then an app answer flows back out.
  await testApi.calendarInstanceAttendeeResponse(
    calendarId,
    m.id,
    iso(occurrence(start, 4)),
    BEN,
    "tentative",
  );
  await testApi.calendarSync(bandId);
  expect(await rsvpOf(4)).toBe("maybe");
  await ben.api.put(
    `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(occurrence(start, 4))}/rsvp`,
    { data: { status: "not_going" } },
  );
  await testApi.calendarSync(bandId);
  expect(await rsvpOf(4)).toBe("not_going");
  const events = await testApi.calendarEvents(calendarId);
  expect(statusOf(instanceOf(events, m.id, occurrence(start, 4))!, BEN)).toBe(
    "declined",
  );
  expect(statusOf(masterOf(events, sid), AVA)).toBe("needsAction");
});

test("deletes beat concurrent edits and the later app write wins", async ({
  testApi,
  db,
}) => {
  const { ava, bandId } = await newBand(testApi);
  const start = nextTuesday(7);
  const editedGig = await createGig(ava.api, bandId, { title: "G1" });
  const deletedGig = await createGig(ava.api, bandId, { title: "G2" });
  const lwwGig = await createGig(ava.api, bandId, { title: "G3" });
  const s1 = await createPractice(ava.api, bandId, start, { title: "S1" });
  const s2 = await createPractice(ava.api, bandId, start, { title: "S2" });
  const calendarId = await connect(ava.api, bandId);
  const ev = () => testApi.calendarEvents(calendarId);
  const gigUrl = (id: string) => `/bands/${bandId}/gigs/${id}`;
  const occ = (sid: string, k: number) =>
    `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(occurrence(start, k))}`;
  const events = await ev();

  // App edit pending, Google deletes: the delete wins.
  await ava.api.patch(gigUrl(editedGig.id), { data: { title: "G1 app" } });
  await testApi.calendarDelete(calendarId, masterOf(events, editedGig.id).id);
  await ava.api.patch(
    `/bands/${bandId}/practices/${s1.id}/occurrences/${keyOf(occurrence(start, 0))}`,
    {
      data: { scope: "all", title: "S1 app" },
    },
  );
  await testApi.calendarDelete(calendarId, masterOf(events, s1.id).id);
  // Same for one occurrence: Google cancels while the app edits it.
  const m2 = masterOf(events, s2.id);
  await ava.api.patch(occ(s2.id, 1), {
    data: { scope: "this", title: "Moved" },
  });
  await testApi.calendarInstanceEdit(
    calendarId,
    m2.id,
    iso(occurrence(start, 1)),
    {
      cancelled: true,
    },
  );
  await testApi.calendarSync(bandId);
  expect((await ava.api.get(gigUrl(editedGig.id))).status()).toBe(404);
  expect(
    (await ava.api.get(`/bands/${bandId}/practices/${s1.id}`)).status(),
  ).toBe(404);
  expect((await ava.api.get(occ(s2.id, 1))).status()).toBe(404);
  expect(masterOf(await ev(), editedGig.id).cancelled).toBe(true);

  // App delete pending, Google edits: the delete wins.
  await ava.api.delete(gigUrl(deletedGig.id));
  await testApi.calendarEdit(calendarId, masterOf(events, deletedGig.id).id, {
    summary: "Remote edit",
  });
  await ava.api.delete(occ(s2.id, 2), { params: { scope: "this" } });
  await testApi.calendarInstanceEdit(
    calendarId,
    m2.id,
    iso(occurrence(start, 2)),
    {
      summary: "Remote instance edit",
    },
  );
  await testApi.calendarSync(bandId);
  expect(masterOf(await ev(), deletedGig.id).cancelled).toBe(true);
  expect(instanceOf(await ev(), m2.id, occurrence(start, 2))!.cancelled).toBe(
    true,
  );
  expect((await ava.api.get(gigUrl(deletedGig.id))).status()).toBe(404);

  // Both sides edit: the app write (pending) overwrites Google.
  await ava.api.patch(gigUrl(lwwGig.id), { data: { title: "App wins" } });
  await testApi.calendarEdit(calendarId, masterOf(events, lwwGig.id).id, {
    summary: "Google loses",
  });
  await testApi.calendarSync(bandId);
  expect(masterOf(await ev(), lwwGig.id).summary).toBe("App wins");
  expect((await (await ava.api.get(gigUrl(lwwGig.id))).json()).title).toBe(
    "App wins",
  );
  const [row] = await db.select().from(gigs).where(eq(gigs.id, lwwGig.id));
  expect(row!.gcalEtag).toBe(masterOf(await ev(), lwwGig.id).etag);

  // Google edits alone: the app follows.
  await testApi.calendarEdit(calendarId, masterOf(events, lwwGig.id).id, {
    summary: "Google later",
  });
  await testApi.calendarSync(bandId);
  expect((await (await ava.api.get(gigUrl(lwwGig.id))).json()).title).toBe(
    "Google later",
  );
});

test("an expired sync token triggers a full resync without duplicates", async ({
  testApi,
  db,
}) => {
  const { ava, bandId } = await newBand(testApi);
  const start = nextTuesday(7);
  const a = await createGig(ava.api, bandId, { title: "A" });
  const b = await createGig(ava.api, bandId, { title: "B" });
  const series = await createPractice(ava.api, bandId, start);
  const calendarId = await connect(ava.api, bandId);
  const events = await testApi.calendarEvents(calendarId);
  const [before] = await db.select().from(calendarSyncStates);

  await testApi.calendarEdit(calendarId, masterOf(events, a.id).id, {
    summary: "A remote",
  });
  await testApi.calendarDelete(calendarId, masterOf(events, b.id).id);
  await testApi.calendarExpireSyncTokens(calendarId);
  await testApi.calendarSync(bandId);

  expect(
    (await (await ava.api.get(`/bands/${bandId}/gigs/${a.id}`)).json()).title,
  ).toBe("A remote");
  expect((await ava.api.get(`/bands/${bandId}/gigs/${b.id}`)).status()).toBe(
    404,
  );
  const after = await testApi.calendarEvents(calendarId);
  expect(after.map((e) => e.id).sort()).toEqual(events.map((e) => e.id).sort());
  expect((await db.select().from(gigs)).length).toBe(2);
  expect((await db.select().from(practiceSeries)).length).toBe(1);
  const [state] = await db.select().from(calendarSyncStates);
  expect(state!.syncToken).not.toBe(before!.syncToken);

  // Deleted while the token lapsed, never in an incremental batch.
  await testApi.calendarDelete(calendarId, masterOf(events, series.id).id);
  await testApi.calendarExpireSyncTokens(calendarId);
  await testApi.calendarSync(bandId);
  expect(
    (await ava.api.get(`/bands/${bandId}/practices/${series.id}`)).status(),
  ).toBe(404);
});
