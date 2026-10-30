import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import rrulePkg from "rrule";
import {
  calendarSyncStates,
  gigs,
  practiceOccurrenceOverrides as overridesTable,
  practiceRsvps,
  practiceSeries,
  type Database,
} from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { buildOccurrence, type SeriesRow } from "../events/occurrences.js";
import {
  assertGcalRepresentable,
  firstOccurrence,
  isOccurrence,
} from "../events/recurrence.js";
import { isValidTimeZone, localDate, localTime } from "../events/time.js";
import {
  GOOGLE_CALENDAR,
  type CalendarEvent,
  type GoogleCalendarAdapter,
} from "../integrations/index.js";
import type { BandSyncContext } from "./calendar-sync.context.js";
import {
  DEFAULT_GIG_MINUTES,
  KIND_GIG,
  KIND_PRACTICE,
  gigLocation,
  gigTimes,
  singleRrule,
} from "./calendar-sync.mapping.js";
import { CalendarSyncQueue } from "./calendar-sync.queue.js";

const { RRule } = rrulePkg;
const MINUTE_MS = 60_000;

type GigRow = typeof gigs.$inferSelect;

function normalizedRule(rule: string): string {
  try {
    return RRule.optionsToString(RRule.parseString(rule));
  } catch {
    return rule;
  }
}

const sameRule = (a: string, b: string): boolean =>
  normalizedRule(a) === normalizedRule(b);

/** Applies Google-side changes to the app without producing push echoes. */
@Injectable()
export class CalendarPullService {
  private readonly log = new Logger(CalendarPullService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_CALENDAR) private readonly calendar: GoogleCalendarAdapter,
    private readonly queue: CalendarSyncQueue,
  ) {}

  // ---- band pass ----

  /** Reads changes since the stored sync token (full resync when absent or expired). */
  async pullBand(ctx: BandSyncContext): Promise<void> {
    const [state] = await this.db
      .select()
      .from(calendarSyncStates)
      .where(eq(calendarSyncStates.bandId, ctx.bandId));
    let full = !state?.syncToken;
    let res = await this.calendar.listChanges(
      ctx.accessToken,
      ctx.calendarId,
      state?.syncToken ?? undefined,
    );
    if (res.status === "sync-token-expired") {
      full = true;
      res = await this.calendar.listChanges(ctx.accessToken, ctx.calendarId);
    }
    if (res.status !== "ok") throw new Error("Calendar full sync failed");

    const events = res.events;
    for (const e of events.filter((x) => !x.recurringEventId)) {
      await this.applyEvent(ctx, e);
    }
    for (const e of events.filter((x) => x.recurringEventId)) {
      await this.applyInstance(ctx, e);
    }
    if (full) await this.applyMissing(ctx, events);

    await this.saveState(ctx.bandId, res.nextSyncToken);
  }

  /** Stores a sync token (and the sync time) without reading any changes. */
  async saveState(bandId: string, syncToken: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(calendarSyncStates)
      .values({ bandId, syncToken, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: calendarSyncStates.bandId,
        set: { syncToken, lastSyncedAt: now },
      });
  }

  /** After a full listing, app events whose Google event vanished were deleted there. */
  private async applyMissing(
    ctx: BandSyncContext,
    events: CalendarEvent[],
  ): Promise<void> {
    const present = new Set(events.map((e) => e.id));
    const gone = (ids: (string | null)[]) =>
      ids.filter((id): id is string => !!id && !present.has(id));
    const g = await this.db
      .select({ id: gigs.id, gcal: gigs.gcalEventId })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, ctx.bandId),
          isNull(gigs.deletedAt),
          isNotNull(gigs.gcalEventId),
        ),
      );
    const goneGigs = new Set(gone(g.map((r) => r.gcal)));
    for (const r of g.filter((x) => x.gcal && goneGigs.has(x.gcal))) {
      await this.removeGig(r.id);
    }
    const s = await this.db
      .select({ id: practiceSeries.id, gcal: practiceSeries.gcalEventId })
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.bandId, ctx.bandId),
          isNull(practiceSeries.deletedAt),
          isNotNull(practiceSeries.gcalEventId),
        ),
      );
    const goneSeries = new Set(gone(s.map((r) => r.gcal)));
    for (const r of s.filter((x) => x.gcal && goneSeries.has(x.gcal))) {
      await this.removeSeries(r.id);
    }
  }

  // ---- gigs and series ----

  /** Applies one non-instance event (a gig or a recurring practice master). */
  async applyEvent(ctx: BandSyncContext, e: CalendarEvent): Promise<void> {
    const kind = e.privateProperties["greenroomKind"];
    const id = e.privateProperties["greenroomId"];
    if (!id || (kind !== KIND_GIG && kind !== KIND_PRACTICE)) return;
    if (kind === KIND_GIG) await this.applyGig(ctx, e, id);
    else await this.applySeries(ctx, e, id);
  }

  private async removeGig(id: string): Promise<void> {
    await this.db
      .update(gigs)
      .set({ deletedAt: new Date(), gcalEventId: null, gcalEtag: null })
      .where(eq(gigs.id, id));
  }

  private async removeSeries(id: string): Promise<void> {
    await this.db
      .update(practiceSeries)
      .set({ deletedAt: new Date(), gcalEventId: null, gcalEtag: null })
      .where(eq(practiceSeries.id, id));
    await this.db
      .update(overridesTable)
      .set({ gcalInstanceEtag: null })
      .where(eq(overridesTable.seriesId, id));
  }

  private async applyGig(
    ctx: BandSyncContext,
    e: CalendarEvent,
    gigId: string,
  ): Promise<void> {
    const [g] = await this.db
      .select()
      .from(gigs)
      .where(
        and(
          eq(gigs.id, gigId),
          eq(gigs.bandId, ctx.bandId),
          eq(gigs.gcalEventId, e.id),
        ),
      );
    if (!g) return;
    if (e.cancelled) {
      if (!g.deletedAt) await this.removeGig(g.id);
      return;
    }
    if (g.deletedAt || g.gcalEtag === e.etag) return;
    // An unpushed app edit is newer; the push overwrites Google.
    if (this.queue.gigDirty(g.id)) return;

    const set = this.gigChanges(g, e);
    const changed = Object.keys(set).length > 0;
    await this.db
      .update(gigs)
      .set({
        ...set,
        gcalEtag: e.etag,
        ...(changed ? {} : { updatedAt: g.updatedAt }),
      })
      .where(eq(gigs.id, g.id));
  }

  private gigChanges(g: GigRow, e: CalendarEvent): Partial<GigRow> {
    const set: Partial<GigRow> = {};
    if (e.summary && e.summary !== g.title) set.title = e.summary;

    if ((e.location ?? "").trim() !== (gigLocation(g) ?? "")) {
      set.venueName = e.location?.trim() || null;
      set.address = null;
      set.googlePlaceId = null;
      set.lat = null;
      set.lng = null;
    }

    const tz =
      e.timeZone && isValidTimeZone(e.timeZone) ? e.timeZone : g.timeZone;
    const cur = gigTimes(g);
    const same = e.allDay
      ? cur.allDay && cur.start === e.start
      : !cur.allDay &&
        new Date(cur.start).getTime() === new Date(e.start).getTime() &&
        new Date(cur.end).getTime() === new Date(e.end).getTime();
    if (same && tz === g.timeZone) return set;

    set.timeZone = tz;
    if (e.allDay) {
      set.allDay = true;
      set.date = e.start;
      set.startsAt = null;
      set.endsAt = null;
      set.loadInAt = null;
      return set;
    }
    const start = new Date(e.start);
    const end = new Date(e.end);
    set.allDay = false;
    set.date = localDate(start, tz);
    set.startsAt = start;
    set.endsAt =
      g.endsAt === null &&
      end.getTime() - start.getTime() === DEFAULT_GIG_MINUTES * MINUTE_MS
        ? null
        : end;
    set.loadInAt =
      g.loadInAt && g.startsAt
        ? new Date(
            g.loadInAt.getTime() + start.getTime() - g.startsAt.getTime(),
          )
        : null;
    return set;
  }

  private async applySeries(
    ctx: BandSyncContext,
    e: CalendarEvent,
    seriesId: string,
  ): Promise<void> {
    const [s] = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.id, seriesId),
          eq(practiceSeries.bandId, ctx.bandId),
          eq(practiceSeries.gcalEventId, e.id),
        ),
      );
    if (!s) return;
    if (e.cancelled) {
      if (!s.deletedAt) await this.removeSeries(s.id);
      return;
    }
    if (s.deletedAt || s.gcalEtag === e.etag) return;
    // An unpushed app edit is newer; the push overwrites Google.
    if (this.queue.seriesDirty(s.id)) return;

    await this.applySeriesChanges(s, e);
  }

  /** Writes remote title, location, time and recurrence changes. */
  private async applySeriesChanges(
    s: SeriesRow,
    e: CalendarEvent,
  ): Promise<void> {
    const tz =
      e.timeZone && isValidTimeZone(e.timeZone) ? e.timeZone : s.timeZone;
    const start = new Date(e.start);
    const end = new Date(e.end);
    const rule = singleRrule(e.recurrence);
    let representable: string | null = null;
    if (rule) {
      try {
        assertGcalRepresentable(rule);
        representable = rule;
      } catch {
        representable = null;
      }
    }
    const rrule =
      representable && !sameRule(representable, s.rrule)
        ? representable
        : s.rrule;
    const first = firstOccurrence(
      rrule,
      localDate(start, tz),
      localTime(start, tz),
      tz,
    );
    const values = {
      title: e.summary || s.title,
      location: e.location?.trim() || null,
      rrule,
      dtstart: first ?? s.dtstart,
      timeZone: tz,
      durationMinutes: Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / MINUTE_MS),
      ),
    };
    const changed =
      values.title !== s.title ||
      values.location !== s.location ||
      values.rrule !== s.rrule ||
      values.dtstart.getTime() !== s.dtstart.getTime() ||
      values.timeZone !== s.timeZone ||
      values.durationMinutes !== s.durationMinutes;
    const [next] = await this.db
      .update(practiceSeries)
      .set({
        ...values,
        gcalEtag: e.etag,
        ...(changed ? {} : { updatedAt: s.updatedAt }),
      })
      .where(eq(practiceSeries.id, s.id))
      .returning();

    const scheduleChanged =
      values.rrule !== s.rrule ||
      values.dtstart.getTime() !== s.dtstart.getTime() ||
      values.timeZone !== s.timeZone;
    if (scheduleChanged) await this.pruneStale(next!);
    // A rule the app cannot represent stays as the app has it and is pushed back.
    if (!representable) await this.queue.series(s.bandId, s.id);
  }

  /** Drops overrides and RSVPs whose key no longer lines up with an occurrence. */
  private async pruneStale(s: SeriesRow): Promise<void> {
    const overrides = await this.db
      .select({ id: overridesTable.id, at: overridesTable.originalStart })
      .from(overridesTable)
      .where(eq(overridesTable.seriesId, s.id));
    const staleOverrides = overrides
      .filter((o) => !isOccurrence(s, o.at))
      .map((o) => o.id);
    if (staleOverrides.length > 0) {
      await this.db
        .delete(overridesTable)
        .where(inArray(overridesTable.id, staleOverrides));
    }
    const rsvps = await this.db
      .select({ id: practiceRsvps.id, at: practiceRsvps.originalStart })
      .from(practiceRsvps)
      .where(eq(practiceRsvps.seriesId, s.id));
    const checked = new Map<number, boolean>();
    const stale = rsvps.filter((r) => {
      const k = r.at.getTime();
      if (!checked.has(k)) checked.set(k, isOccurrence(s, r.at));
      return !checked.get(k);
    });
    if (stale.length > 0) {
      await this.db.delete(practiceRsvps).where(
        inArray(
          practiceRsvps.id,
          stale.map((r) => r.id),
        ),
      );
    }
  }

  // ---- instances ----

  /** Applies an edit or cancellation of one occurrence. */
  async applyInstance(ctx: BandSyncContext, e: CalendarEvent): Promise<void> {
    if (!e.recurringEventId || !e.originalStart) return;
    const [s] = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.bandId, ctx.bandId),
          eq(practiceSeries.gcalEventId, e.recurringEventId),
        ),
      );
    if (!s || s.deletedAt) return;
    const at = new Date(e.originalStart);
    if (Number.isNaN(at.getTime()) || !isOccurrence(s, at)) return;

    const [override] = await this.db
      .select()
      .from(overridesTable)
      .where(
        and(
          eq(overridesTable.seriesId, s.id),
          eq(overridesTable.originalStart, at),
        ),
      );

    if (e.cancelled) {
      if (override?.cancelled && override.gcalInstanceEtag === e.etag) return;
      await this.writeOverride(s, at, {
        cancelled: true,
        gcalInstanceEtag: e.etag,
      });
      return;
    }

    // An unpushed app change is newer; only cancellations (deletes) beat it.
    if (this.queue.occurrenceDirty(s.id, at.getTime())) return;
    if (override?.gcalInstanceEtag !== e.etag) {
      await this.applyInstanceContent(s, at, override, e);
    }
  }

  private async applyInstanceContent(
    s: SeriesRow,
    at: Date,
    override: typeof overridesTable.$inferSelect | undefined,
    e: CalendarEvent,
  ): Promise<void> {
    const expected = buildOccurrence(s, at, override);
    const start = new Date(e.start);
    const end = new Date(e.end);
    const differs =
      !!override?.cancelled ||
      e.summary !== expected.title ||
      (e.location ?? "") !== (expected.location ?? "") ||
      start.getTime() !== new Date(expected.startsAt).getTime() ||
      end.getTime() !== new Date(expected.endsAt).getTime();
    if (!differs) {
      if (override) {
        await this.writeOverride(s, at, { gcalInstanceEtag: e.etag });
      }
      return;
    }
    const defaultTime =
      start.getTime() === at.getTime() &&
      end.getTime() - start.getTime() === s.durationMinutes * MINUTE_MS;
    const location = e.location ?? "";
    await this.writeOverride(s, at, {
      cancelled: false,
      startsAt: defaultTime ? null : start,
      endsAt: defaultTime ? null : end,
      title: e.summary === s.title ? null : e.summary,
      location: location === (s.location ?? "") ? null : location,
      gcalInstanceEtag: e.etag,
    });
  }

  private async writeOverride(
    s: SeriesRow,
    at: Date,
    values: Partial<typeof overridesTable.$inferInsert>,
  ): Promise<void> {
    await this.db
      .insert(overridesTable)
      .values({
        bandId: s.bandId,
        seriesId: s.id,
        originalStart: at,
        ...values,
      })
      .onConflictDoUpdate({
        target: [overridesTable.seriesId, overridesTable.originalStart],
        set: values,
      });
  }
}
