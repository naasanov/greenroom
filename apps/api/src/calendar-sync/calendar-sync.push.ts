import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import {
  gigs,
  practiceOccurrenceOverrides as overridesTable,
  practiceRsvps,
  practiceSeries,
  type Database,
} from "@greenroom/db";
import { webUrl } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import type { OverrideRow, SeriesRow } from "../events/occurrences.js";
import { isOccurrence } from "../events/recurrence.js";
import {
  GOOGLE_CALENDAR,
  type AttendeeResponse,
  type CalendarEvent,
  type CalendarEventResult,
  type GoogleCalendarAdapter,
} from "../integrations/index.js";
import type { BandSyncContext } from "./calendar-sync.context.js";
import {
  DAY_MS,
  SYNC_PAST_DAYS,
  fromGoogleResponse,
  gigInput,
  instanceInput,
  sameEmail,
  seriesInput,
  syncWindow,
  toGoogleResponse,
} from "./calendar-sync.mapping.js";
import { CalendarPullService } from "./calendar-sync.pull.js";
import type { PushJob } from "./calendar-sync.queue.js";

type GigRow = typeof gigs.$inferSelect;
type RsvpRow = typeof practiceRsvps.$inferSelect;

/** Reconciles current app state onto Google, one gig, series or occurrence at a time. */
@Injectable()
export class CalendarPushService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_CALENDAR) private readonly calendar: GoogleCalendarAdapter,
    private readonly pull: CalendarPullService,
  ) {}

  async run(ctx: BandSyncContext, job: PushJob): Promise<void> {
    switch (job.kind) {
      case "gig":
        return this.pushGig(ctx, job.id, false);
      case "gig-att":
        return this.pushGig(ctx, job.id, true);
      case "series":
        return this.pushSeries(ctx, job.id, false);
      case "series-att":
        return this.pushSeries(ctx, job.id, true);
      case "occ":
        return this.pushOccurrence(ctx, job.id, new Date(job.startMs!), false);
      case "rsvp":
        return this.pushOccurrence(ctx, job.id, new Date(job.startMs!), true);
    }
  }

  /** Pushes every live gig in the window and every live series; returns the counts. */
  async pushAll(
    ctx: BandSyncContext,
  ): Promise<{ gigs: number; practiceSeries: number }> {
    const gigRows = await this.liveGigs(ctx.bandId);
    for (const g of gigRows) await this.pushGig(ctx, g.id, false);
    const seriesRows = await this.db
      .select({ id: practiceSeries.id })
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.bandId, ctx.bandId),
          isNull(practiceSeries.deletedAt),
        ),
      );
    for (const s of seriesRows) await this.pushSeries(ctx, s.id, false);
    return { gigs: gigRows.length, practiceSeries: seriesRows.length };
  }

  /** Live gigs dated within the sync window (30 days back and later). */
  liveGigs(bandId: string): Promise<{ id: string }[]> {
    return this.db
      .select({ id: gigs.id })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
          gte(gigs.date, windowStartDate()),
        ),
      );
  }

  // ---- gigs ----

  private async pushGig(
    ctx: BandSyncContext,
    gigId: string,
    attendeesOnly: boolean,
  ): Promise<void> {
    const [g] = await this.db
      .select()
      .from(gigs)
      .where(and(eq(gigs.id, gigId), eq(gigs.bandId, ctx.bandId)));
    if (!g) return;

    if (g.deletedAt) {
      if (g.gcalEventId) {
        await this.calendar.deleteEvent(
          ctx.accessToken,
          ctx.calendarId,
          g.gcalEventId,
        );
        await this.clearGigIds(g);
      }
      return;
    }
    const input = gigInput(g, ctx.emails, webUrl());

    if (!g.gcalEventId) {
      if (attendeesOnly || g.date < windowStartDate()) return;
      const created = await this.calendar.createEvent(
        ctx.accessToken,
        ctx.calendarId,
        input,
      );
      await this.storeGig(g, created.id, created.etag);
      return;
    }

    const patch = attendeesOnly ? { attendeeEmails: ctx.emails } : input;
    let res = await this.calendar.updateEvent(
      ctx.accessToken,
      ctx.calendarId,
      g.gcalEventId,
      patch,
      g.gcalEtag ?? undefined,
    );
    if (res.status === "etag-mismatch") {
      if (attendeesOnly) {
        // The remote edit is taken in first so the attendee write does not mask it.
        await this.pull.applyEvent(ctx, res.event);
        const [fresh] = await this.db
          .select()
          .from(gigs)
          .where(eq(gigs.id, g.id));
        res = await this.calendar.updateEvent(
          ctx.accessToken,
          ctx.calendarId,
          g.gcalEventId,
          patch,
          fresh?.gcalEtag ?? res.event.etag,
        );
      } else {
        res = await this.calendar.updateEvent(
          ctx.accessToken,
          ctx.calendarId,
          g.gcalEventId,
          patch,
        );
      }
    }
    if (res.status === "ok") {
      await this.storeGig(g, g.gcalEventId, res.event.etag);
    } else if (res.status === "not-found") {
      // A delete on Google beats any app edit.
      await this.db
        .update(gigs)
        .set({ deletedAt: new Date(), gcalEventId: null, gcalEtag: null })
        .where(eq(gigs.id, g.id));
    } else {
      throw new Error("Calendar gig update kept conflicting");
    }
  }

  private async storeGig(
    g: GigRow,
    eventId: string,
    etag: string,
  ): Promise<void> {
    await this.db
      .update(gigs)
      .set({ gcalEventId: eventId, gcalEtag: etag, updatedAt: g.updatedAt })
      .where(eq(gigs.id, g.id));
  }

  private async clearGigIds(g: GigRow): Promise<void> {
    await this.db
      .update(gigs)
      .set({ gcalEventId: null, gcalEtag: null, updatedAt: g.updatedAt })
      .where(eq(gigs.id, g.id));
  }

  // ---- practice series ----

  private async pushSeries(
    ctx: BandSyncContext,
    seriesId: string,
    attendeesOnly: boolean,
  ): Promise<void> {
    const s = await this.findSeries(ctx.bandId, seriesId);
    if (!s) return;

    if (s.deletedAt) {
      if (s.gcalEventId) {
        await this.calendar.deleteEvent(
          ctx.accessToken,
          ctx.calendarId,
          s.gcalEventId,
        );
        await this.clearSeriesIds(s);
      }
      return;
    }
    if (!s.gcalEventId && attendeesOnly) return;

    const input = seriesInput(s, ctx.emails, webUrl());
    let master: CalendarEvent;
    if (!s.gcalEventId) {
      master = await this.calendar.createEvent(
        ctx.accessToken,
        ctx.calendarId,
        input,
      );
      await this.storeSeries(s, master.id, master.etag);
    } else {
      const result = await this.updateMaster(
        ctx,
        s,
        s.gcalEventId,
        attendeesOnly,
      );
      if (result === "gone") return;
      master = result;
      await this.storeSeries(s, s.gcalEventId, master.etag);
    }
    const eventId = master.id;
    await this.pushInstances(
      ctx,
      { ...s, gcalEventId: eventId },
      master,
      attendeesOnly,
    );
  }

  /** Updates the master with its stored etag; returns the stored event or "gone". */
  private async updateMaster(
    ctx: BandSyncContext,
    s: SeriesRow,
    eventId: string,
    attendeesOnly: boolean,
  ): Promise<CalendarEvent | "gone"> {
    const patch = attendeesOnly
      ? { attendeeEmails: ctx.emails }
      : seriesInput(s, ctx.emails, webUrl());
    const update = (etag?: string): Promise<CalendarEventResult> =>
      this.calendar.updateEvent(
        ctx.accessToken,
        ctx.calendarId,
        eventId,
        patch,
        etag,
      );

    let res = await update(s.gcalEtag ?? undefined);
    if (res.status === "etag-mismatch") {
      const remote = res.event;
      if (attendeesOnly) {
        await this.pull.applyEvent(ctx, remote);
        const fresh = await this.findSeries(ctx.bandId, s.id);
        res = await update(fresh?.gcalEtag ?? remote.etag);
      } else {
        // The app write wins on content; Google's attendee answers are kept first.
        await this.pull.applyMasterResponses(
          ctx,
          s,
          remote,
          this.pull.instanceSource(ctx),
        );
        res = await update();
      }
    }
    if (res.status === "ok") return res.event;
    if (res.status === "not-found") {
      // A delete on Google beats any app edit.
      await this.db
        .update(practiceSeries)
        .set({ deletedAt: new Date(), gcalEventId: null, gcalEtag: null })
        .where(eq(practiceSeries.id, s.id));
      return "gone";
    }
    throw new Error("Calendar series update kept conflicting");
  }

  private async findSeries(
    bandId: string,
    seriesId: string,
  ): Promise<SeriesRow | undefined> {
    const [s] = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(eq(practiceSeries.id, seriesId), eq(practiceSeries.bandId, bandId)),
      );
    return s;
  }

  private async storeSeries(
    s: SeriesRow,
    eventId: string,
    etag: string,
  ): Promise<void> {
    await this.db
      .update(practiceSeries)
      .set({ gcalEventId: eventId, gcalEtag: etag, updatedAt: s.updatedAt })
      .where(eq(practiceSeries.id, s.id));
  }

  private async clearSeriesIds(s: SeriesRow): Promise<void> {
    await this.db
      .update(practiceSeries)
      .set({ gcalEventId: null, gcalEtag: null, updatedAt: s.updatedAt })
      .where(eq(practiceSeries.id, s.id));
    await this.db
      .update(overridesTable)
      .set({ gcalInstanceEtag: null })
      .where(eq(overridesTable.seriesId, s.id));
  }

  // ---- instances ----

  /**
   * Overrides, cancellations and answers that differ from the master's, patched
   * as instance exceptions. RSVP rows equal to the master's answer need no exception.
   */
  private async pushInstances(
    ctx: BandSyncContext,
    s: SeriesRow & { gcalEventId: string },
    master: CalendarEvent,
    attendeesOnly: boolean,
  ): Promise<void> {
    const overrides = await this.db
      .select()
      .from(overridesTable)
      .where(eq(overridesTable.seriesId, s.id));
    const { from, to } = syncWindow();
    const rows = await this.db
      .select()
      .from(practiceRsvps)
      .where(
        and(
          eq(practiceRsvps.seriesId, s.id),
          gte(practiceRsvps.originalStart, from),
          lte(practiceRsvps.originalStart, to),
        ),
      );
    const rowsByStart = groupRows(rows);
    const targets = new Set<number>(
      overrides.map((o) => o.originalStart.getTime()),
    );
    for (const [ms, group] of rowsByStart) {
      if (group.some((r) => this.differsFromMaster(ctx, master, r)))
        targets.add(ms);
    }

    for (const ms of [...targets].sort((a, b) => a - b)) {
      const at = new Date(ms);
      if (!isOccurrence(s, at)) continue;
      const override = overrides.find((o) => o.originalStart.getTime() === ms);
      if (attendeesOnly && override?.cancelled) continue;
      await this.patchInstance(
        ctx,
        s,
        at,
        override,
        this.responses(ctx, rowsByStart.get(ms) ?? []),
        attendeesOnly,
      );
    }
  }

  private differsFromMaster(
    ctx: BandSyncContext,
    master: CalendarEvent,
    row: RsvpRow,
  ): boolean {
    const member = ctx.members.find((m) => m.userId === row.userId);
    if (!member) return false;
    const current = master.attendees.find((a) =>
      sameEmail(a.email, member.email),
    );
    const masterStatus = fromGoogleResponse(
      current?.responseStatus ?? "needsAction",
    );
    return masterStatus !== row.status;
  }

  private responses(
    ctx: BandSyncContext,
    rows: readonly RsvpRow[],
  ): Record<string, AttendeeResponse> {
    const out: Record<string, AttendeeResponse> = {};
    for (const r of rows) {
      const member = ctx.members.find((m) => m.userId === r.userId);
      if (member) out[member.email] = toGoogleResponse(r.status);
    }
    return out;
  }

  private async pushOccurrence(
    ctx: BandSyncContext,
    seriesId: string,
    at: Date,
    rsvpOnly: boolean,
  ): Promise<void> {
    const s = await this.findSeries(ctx.bandId, seriesId);
    if (!s || s.deletedAt || !s.gcalEventId) return;
    if (!isOccurrence(s, at)) return;
    const [override] = await this.db
      .select()
      .from(overridesTable)
      .where(
        and(
          eq(overridesTable.seriesId, s.id),
          eq(overridesTable.originalStart, at),
        ),
      );
    if (rsvpOnly && override?.cancelled) return;
    const rows = await this.db
      .select()
      .from(practiceRsvps)
      .where(
        and(
          eq(practiceRsvps.seriesId, s.id),
          eq(practiceRsvps.originalStart, at),
        ),
      );
    await this.patchInstance(
      ctx,
      { ...s, gcalEventId: s.gcalEventId },
      at,
      override,
      this.responses(ctx, rows),
      rsvpOnly,
    );
  }

  private async patchInstance(
    ctx: BandSyncContext,
    s: SeriesRow & { gcalEventId: string },
    at: Date,
    override: OverrideRow | undefined,
    responses: Record<string, AttendeeResponse>,
    attendeesOnly: boolean,
  ): Promise<void> {
    const patch = override?.cancelled
      ? { cancelled: true }
      : attendeesOnly
        ? { attendeeEmails: ctx.emails, attendeeResponses: responses }
        : instanceInput(s, at, override, ctx.emails, responses);
    const res = await this.calendar.patchInstance(
      ctx.accessToken,
      ctx.calendarId,
      s.gcalEventId,
      at.toISOString(),
      patch,
    );
    if (res.status === "ok" && override) {
      await this.db
        .update(overridesTable)
        .set({
          gcalInstanceEtag: res.event.etag,
          updatedAt: override.updatedAt,
        })
        .where(eq(overridesTable.id, override.id));
    }
  }
}

function groupRows(rows: readonly RsvpRow[]): Map<number, RsvpRow[]> {
  const out = new Map<number, RsvpRow[]>();
  for (const r of rows) {
    const k = r.originalStart.getTime();
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

/** First gig date (YYYY-MM-DD) inside the sync window. */
function windowStartDate(now = new Date()): string {
  return new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
