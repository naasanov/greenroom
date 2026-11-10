import { expect, test } from "../src/fixtures.js";
import type { CalendarInviteEmail } from "../src/test-api.js";
import {
  AVA,
  BEN,
  BEN_CAL,
  createGig,
  createPractice,
  dateIn,
  keyOf,
  newBand,
  nextTuesday,
  occurrence,
} from "./calendar-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

/** The iCalendar text with folded lines joined, so assertions can match whole properties. */
const unfold = (ics: string): string => ics.replace(/\r\n[ \t]/g, "");
const ics = (m: CalendarInviteEmail): string => unfold(m.ics);
const compact = (date: string): string => date.replaceAll("-", "");

const sorted = (list: CalendarInviteEmail[]): string[] =>
  list.map((m) => m.to).sort();

test("a new gig sends one REQUEST per active member and none to roster-only members", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  await join(BEN);
  const res = await ava.api.post(`/bands/${bandId}/placeholders`, {
    data: { displayName: "Roster Rick", email: "rick@example.com" },
  });
  expect(res.status()).toBe(204);
  await testApi.calendarInvitesFlush(bandId);
  await testApi.calendarInvitesFor(undefined, true);

  const gig = await createGig(ava.api, bandId, {
    title: "Club Meridian",
    venueName: "Club Meridian",
    address: "88 Main St, Springfield",
    notes: "Bring cables; no drums",
    timeZone: "America/New_York",
  });
  // Nothing is sent until the debounce queue is drained.
  expect(await testApi.calendarInvitesFor()).toHaveLength(0);
  await testApi.calendarInvitesFlush(bandId);

  const sent = await testApi.calendarInvitesFor();
  expect(sorted(sent)).toEqual([AVA, BEN]);
  const m = sent.find((x) => x.to === BEN)!;
  const text = ics(m);
  expect(m.method).toBe("REQUEST");
  expect(m.subject).toContain("Club Meridian");
  expect(text).toContain("METHOD:REQUEST");
  expect(text).toContain(`UID:gig-${gig.id}@`);
  expect(text).toContain("SEQUENCE:0");
  expect(text).toContain("SUMMARY:Club Meridian");
  expect(text).toContain("LOCATION:Club Meridian\\, 88 Main St\\, Springfield");
  expect(text).toContain("DESCRIPTION:Bring cables\\; no drums");
  expect(text).toContain(`/gigs/`);
  expect(text).toContain(
    `DTSTART;TZID=America/New_York:${compact(gig.date)}T200000`,
  );
  expect(text).toContain("BEGIN:VTIMEZONE");
  expect(text).toContain("TZID:America/New_York");
  expect(text).toMatch(
    /ORGANIZER;CN="[^"]+":mailto:rsvp\+g[0-9a-f]+@greenroom\.fyi/,
  );
  expect(text).toMatch(
    new RegExp(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE[^:]*:mailto:${BEN}`,
    ),
  );
  expect(m.ics).toContain("\r\n");
});

test("an all-day gig uses VALUE=DATE", async ({ testApi }) => {
  const { ava, bandId } = await newBand(testApi, { invites: true });
  const date = dateIn(30);
  await createGig(ava.api, bandId, {
    title: "Festival",
    date,
    allDay: true,
    startTime: undefined,
    endTime: undefined,
  });
  await testApi.calendarInvitesFlush(bandId);
  const [m] = await testApi.calendarInvitesFor(AVA);
  expect(ics(m!)).toContain(`DTSTART;VALUE=DATE:${compact(date)}`);
});

test("editing a gig bumps SEQUENCE with the same UID, and a no-op edit sends nothing", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  await join(BEN);
  const gig = await createGig(ava.api, bandId, { title: "Old Name" });
  await testApi.calendarInvitesFlush(bandId);
  await testApi.calendarInvitesFor(undefined, true);

  // Two quick edits coalesce into one email per member.
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "Interim" },
  });
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "New Name" },
  });
  await testApi.calendarInvitesFlush(bandId);
  const updates = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(updates)).toEqual([AVA, BEN]);
  for (const m of updates) {
    expect(m.method).toBe("REQUEST");
    expect(m.subject).toMatch(/^Updated invitation/);
    expect(ics(m)).toContain(`UID:gig-${gig.id}@`);
    expect(ics(m)).toContain("SEQUENCE:1");
    expect(ics(m)).toContain("SUMMARY:New Name");
  }

  // Saving the same values again changes nothing.
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "New Name" },
  });
  await testApi.calendarInvitesFlush(bandId);
  expect(await testApi.calendarInvitesFor()).toHaveLength(0);
});

test("deleting a gig sends a CANCEL, and past gigs are never sent", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  await join(BEN);
  await createGig(ava.api, bandId, { title: "Ancient", date: dateIn(-5) });
  const gig = await createGig(ava.api, bandId, { title: "Doomed" });
  await testApi.calendarInvitesFlush(bandId);
  const first = await testApi.calendarInvitesFor(undefined, true);
  expect(
    first.map((m) => ics(m)).every((t) => t.includes("SUMMARY:Doomed")),
  ).toBe(true);
  expect(first).toHaveLength(2);

  const res = await ava.api.delete(`/bands/${bandId}/gigs/${gig.id}`);
  expect(res.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const cancels = await testApi.calendarInvitesFor();
  expect(sorted(cancels)).toEqual([AVA, BEN]);
  for (const m of cancels) {
    expect(m.method).toBe("CANCEL");
    expect(m.subject).toMatch(/^Canceled/);
    expect(ics(m)).toContain("METHOD:CANCEL");
    expect(ics(m)).toContain("STATUS:CANCELLED");
    expect(ics(m)).toContain(`UID:gig-${gig.id}@`);
    expect(ics(m)).toContain("SEQUENCE:1");
  }
});

test("a practice series carries an RRULE, and occurrence edits and cancels update the same UID", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  await join(BEN);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    title: "Weekly practice",
    location: "Room B",
  });
  const sid = series.id as string;
  await testApi.calendarInvitesFlush(bandId);
  const created = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(created)).toEqual([AVA, BEN]);
  const text = ics(created[0]!);
  expect(text).toContain(`UID:series-${sid}@`);
  expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
  expect(text).toContain("SEQUENCE:0");
  expect(text).toContain("LOCATION:Room B");
  expect(text).toContain(`/practices/${sid}`);
  expect(text).toContain(`DTSTART:${compact(start)}T190000Z`);
  expect(text).toMatch(/ORGANIZER;CN="[^"]+":mailto:rsvp\+p[0-9a-f]+@/);
  expect(text).not.toContain("EXDATE");

  // Cancel one occurrence: an updated REQUEST with an EXDATE.
  const cancelled = occurrence(start, 2);
  const base = `/bands/${bandId}/practices/${sid}/occurrences`;
  const del = await ava.api.delete(`${base}/${keyOf(cancelled)}`, {
    params: { scope: "this" },
  });
  expect(del.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const afterCancel = await testApi.calendarInvitesFor(BEN, true);
  expect(afterCancel).toHaveLength(1);
  expect(afterCancel[0]!.method).toBe("REQUEST");
  expect(ics(afterCancel[0]!)).toContain("SEQUENCE:1");
  expect(ics(afterCancel[0]!)).toMatch(/EXDATE:\d{8}T\d{6}Z/);

  // Move another occurrence: a RECURRENCE-ID override on the same UID.
  const moved = occurrence(start, 3);
  const patch = await ava.api.patch(`${base}/${keyOf(moved)}`, {
    data: { scope: "this", startTime: "20:00" },
  });
  expect(patch.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const afterMove = await testApi.calendarInvitesFor(BEN, true);
  expect(afterMove).toHaveLength(1);
  const moveText = ics(afterMove[0]!);
  expect(moveText).toContain("SEQUENCE:2");
  expect(moveText).toMatch(/RECURRENCE-ID:\d{8}T\d{6}Z/);
  expect(moveText).toContain(`UID:series-${sid}@`);
  expect(moveText.match(/BEGIN:VEVENT/g)).toHaveLength(2);

  // Deleting the whole series cancels it.
  const all = await ava.api.delete(`${base}/${keyOf(occurrence(start, 0))}`, {
    params: { scope: "all" },
  });
  expect(all.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const cancels = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(cancels)).toEqual([AVA, BEN]);
  expect(cancels.every((m) => m.method === "CANCEL")).toBe(true);
  expect(ics(cancels[0]!)).toContain("STATUS:CANCELLED");
});

test("a joining member gets the upcoming events and a leaving member gets CANCELs", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  await createGig(ava.api, bandId, { title: "Past", date: dateIn(-5) });
  const gig = await createGig(ava.api, bandId, { title: "Upcoming gig" });
  const series = await createPractice(ava.api, bandId, nextTuesday(7));
  await testApi.calendarInvitesFlush(bandId);
  expect(sorted(await testApi.calendarInvitesFor(undefined, true))).toEqual([
    AVA,
    AVA,
  ]);

  const ben = await join(BEN);
  await testApi.calendarInvitesFlush(bandId);
  const joined = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(joined)).toEqual([BEN, BEN]);
  const uids = joined.map((m) => /UID:(\S+)/.exec(ics(m))![1]).sort();
  expect(uids.map((u) => u!.split("@")[0])).toEqual(
    [`gig-${gig.id}`, `series-${series.id}`].sort(),
  );
  expect(joined.every((m) => m.method === "REQUEST")).toBe(true);

  const left = await ben.api.post(`/bands/${bandId}/leave`, { data: {} });
  expect(left.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const cancels = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(cancels)).toEqual([BEN, BEN]);
  expect(cancels.every((m) => m.method === "CANCEL")).toBe(true);
  expect(cancels.every((m) => ics(m).includes("SEQUENCE:1"))).toBe(true);

  // Rejoining sends fresh REQUESTs with a higher SEQUENCE than the cancel.
  await join(BEN);
  await testApi.calendarInvitesFlush(bandId);
  const rejoined = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(rejoined)).toEqual([BEN, BEN]);
  expect(rejoined.every((m) => ics(m).includes("SEQUENCE:2"))).toBe(true);
});

test("opting out stops sends, and opting back in catches up on missed events only", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  const ben = await join(BEN);
  await createGig(ava.api, bandId, { title: "Before opt-out" });
  await testApi.calendarInvitesFlush(bandId);
  await testApi.calendarInvitesFor(undefined, true);

  await testApi.calendarInvitesEnabled(ben.user.id, false);
  await testApi.calendarInvitesFlush(bandId);
  expect(await testApi.calendarInvitesFor()).toHaveLength(0);

  await createGig(ava.api, bandId, {
    title: "While opted out",
    date: dateIn(12),
  });
  await testApi.calendarInvitesFlush(bandId);
  const during = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(during)).toEqual([AVA]);

  await testApi.calendarInvitesEnabled(ben.user.id, true);
  await testApi.calendarInvitesFlush(bandId);
  const caughtUp = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(caughtUp)).toEqual([BEN]);
  expect(ics(caughtUp[0]!)).toContain("SUMMARY:While opted out");
});

test("a calendar email override receives the invites and the sign-in address is cancelled", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  const ben = await join(BEN);
  const gig = await createGig(ava.api, bandId, { title: "Override gig" });
  await testApi.calendarInvitesFlush(bandId);
  await testApi.calendarInvitesFor(undefined, true);

  const res = await ben.api.patch("/auth/me", {
    data: { calendarEmail: BEN_CAL },
  });
  expect(res.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const sent = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(sent)).toEqual([BEN, BEN_CAL].sort());
  const toCal = sent.find((m) => m.to === BEN_CAL)!;
  expect(toCal.method).toBe("REQUEST");
  expect(ics(toCal)).toContain(`UID:gig-${gig.id}@`);
  expect(ics(toCal)).toContain(`mailto:${BEN_CAL}`);
  expect(sent.find((m) => m.to === BEN)!.method).toBe("CANCEL");

  // Later edits go only to the calendar address.
  await ava.api.patch(`/bands/${bandId}/gigs/${gig.id}`, {
    data: { title: "Override gig 2" },
  });
  await testApi.calendarInvitesFlush(bandId);
  const later = await testApi.calendarInvitesFor(undefined, true);
  expect(sorted(later)).toEqual([AVA, BEN_CAL].sort());
});
