// DB-backed check of the invite reconcile. Needs a scratch database it may truncate:
// CHECK_DATABASE_URL=postgres://.../scratch INTEGRATIONS_MODE=fake node service.js (compiled to a temp dir).
import assert from "node:assert/strict";
import {
  bands,
  createDb,
  gigs,
  memberships,
  practiceOccurrenceOverrides,
  practiceSeries,
  resetDatabase,
  runMigrations,
  users,
} from "@greenroom/db";
import { FakeEmailAdapter } from "../../integrations/email/email.fake.js";
import { CalendarInviteQueue } from "../calendar-invite.queue.js";
import { CalendarInviteService } from "../calendar-invite.service.js";

const url = process.env.CHECK_DATABASE_URL;
if (!url) throw new Error("CHECK_DATABASE_URL is required");
await runMigrations(url);
const { db, close } = createDb(url, { max: 2 });
await resetDatabase(db);

const email = new FakeEmailAdapter();
const queue = new CalendarInviteQueue(db, {} as never);
const svc = new CalendarInviteService(db, email, queue);
const ics = (i: { ics: string }): string => i.ics.replace(/\r\n[ \t]/g, "");
const take = (): ReturnType<FakeEmailAdapter["sentCalendarInvites"]> => {
  const all = email.sentCalendarInvites();
  email.clearCalendarInvites();
  return all;
};

const [band] = await db
  .insert(bands)
  .values({ name: "Foxes", slug: "foxes" })
  .returning();
const bandId = band!.id;
const mk = async (
  e: string,
  extra: Partial<typeof users.$inferInsert> = {},
) => {
  const [u] = await db
    .insert(users)
    .values({ email: e, displayName: e.split("@")[0]!, ...extra })
    .returning();
  await db.insert(memberships).values({ bandId, userId: u!.id });
  return u!;
};
const ava = await mk("ava@example.com");
const ben = await mk("Ben@Example.com");
await mk("rick@example.com", { isPlaceholder: true });

const day = (n: number): string =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const [gig] = await db
  .insert(gigs)
  .values({
    bandId,
    title: "Club",
    date: day(10),
    timeZone: "America/New_York",
    startsAt: new Date(`${day(10)}T23:00:00Z`),
    venueName: "The Club",
  })
  .returning();
await queue.gig(bandId, gig!.id);
await svc.flush(bandId);
let sent = take();
assert.deepEqual(sent.map((s) => s.to).sort(), [
  "Ben@Example.com",
  "ava@example.com",
]);
assert.ok(ics(sent[0]!).includes("SEQUENCE:0"));
assert.ok(ics(sent[0]!).includes("BEGIN:VTIMEZONE"));

await queue.gig(bandId, gig!.id);
await svc.flush(bandId);
assert.equal(take().length, 0, "no-op resend");

await db
  .update(gigs)
  .set({ title: "Club 2" })
  .where((await import("drizzle-orm")).eq(gigs.id, gig!.id));
await queue.gig(bandId, gig!.id);
await svc.flush(bandId);
sent = take();
assert.equal(sent.length, 2);
assert.ok(
  ics(sent[0]!).includes("SEQUENCE:1") &&
    sent[0]!.subject.startsWith("Updated"),
);

// Series with a cancelled and a moved occurrence.
const start = new Date(`${day(7)}T19:00:00Z`);
const [s] = await db
  .insert(practiceSeries)
  .values({
    bandId,
    title: "Practice",
    rrule:
      "RRULE:FREQ=WEEKLY;BYDAY=" +
      ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][start.getUTCDay()],
    dtstart: start,
    timeZone: "UTC",
    durationMinutes: 120,
  })
  .returning();
await queue.series(bandId, s!.id);
await svc.flush(bandId);
sent = take();
assert.equal(sent.length, 2);
assert.ok(ics(sent[0]!).includes("RRULE:FREQ=WEEKLY"));
const second = new Date(start.getTime() + 7 * 86_400_000);
const third = new Date(start.getTime() + 14 * 86_400_000);
await db.insert(practiceOccurrenceOverrides).values([
  { bandId, seriesId: s!.id, originalStart: second, cancelled: true },
  {
    bandId,
    seriesId: s!.id,
    originalStart: third,
    startsAt: new Date(third.getTime() + 3_600_000),
  },
]);
await queue.series(bandId, s!.id);
await svc.flush(bandId);
sent = take();
assert.equal(sent.length, 2);
const text = ics(sent[0]!);
assert.ok(
  text.includes("EXDATE:") &&
    text.includes("RECURRENCE-ID:") &&
    text.includes("SEQUENCE:1"),
);

// Opt-out pauses Ben; leaving cancels only for enabled members.
await db
  .update(users)
  .set({ calendarInvitesEnabled: false })
  .where((await import("drizzle-orm")).eq(users.id, ben.id));
await queue.band(bandId);
await svc.flush(bandId);
assert.equal(take().length, 0);
await db
  .update(users)
  .set({ calendarInvitesEnabled: true })
  .where((await import("drizzle-orm")).eq(users.id, ben.id));
await queue.band(bandId);
await svc.flush(bandId);
assert.equal(take().length, 0, "re-enable with nothing missed sends nothing");
await db
  .update(memberships)
  .set({ leftAt: new Date() })
  .where((await import("drizzle-orm")).eq(memberships.userId, ben.id));
await queue.band(bandId);
await svc.flush(bandId);
sent = take();
assert.equal(sent.length, 2);
assert.ok(
  sent.every((m) => m.method === "CANCEL" && m.to === "ben@example.com"),
);
void ava;
await close();
console.log("invite service checks passed");
