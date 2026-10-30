import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, isNull } from "drizzle-orm";
import {
  gigs,
  practiceOccurrenceOverrides as overridesTable,
  practiceSeries,
  type Database,
} from "@greenroom/db";
import { webUrl } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import type { OverrideRow, SeriesRow } from "../events/occurrences.js";
import { isOccurrence } from "../events/recurrence.js";
import {
  GOOGLE_CALENDAR,
  type CalendarEvent,
  type CalendarEventResult,
  type GoogleCalendarAdapter,
} from "../integrations/index.js";
import type { BandSyncContext } from "./calendar-sync.context.js";
import { CalendarAclService } from "./calendar-sync.acl.js";
import {
  DAY_MS,
  SYNC_PAST_DAYS,
  gigInput,
  instanceInput,
  seriesInput,
} from "./calendar-sync.mapping.js";
import { CalendarPullService } from "./calendar-sync.pull.js";
import type { PushJob } from "./calendar-sync.queue.js";

type GigRow = typeof gigs.$inferSelect;

/** Reconciles current app state onto Google, one gig, series or occurrence at a time. */
@Injectable()
export class CalendarPushService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_CALENDAR) private readonly calendar: GoogleCalendarAdapter,
    private readonly pull: CalendarPullService,
    private readonly acl: CalendarAclService,
  ) {}

  async run(ctx: BandSyncContext, job: PushJob): Promise<void> {
    switch (job.kind) {
      case "gig":
        return this.pushGig(ctx, job.id);
      case "series":
        return this.pushSeries(ctx, job.id);
      case "occ":
        return this.pushOccurrence(ctx, job.id, new Date(job.startMs!));
      case "acl":
        return this.acl.reconcile(ctx);
    }
  }

  /** Pushes every live gig in the window and every live series; returns the counts. */
  async pushAll(
    ctx: BandSyncContext,
  ): Promise<{ gigs: number; practiceSeries: number }> {
    const gigRows = await this.liveGigs(ctx.bandId);
    for (const g of gigRows) await this.pushGig(ctx, g.id);
    const seriesRows = await this.db
      .select({ id: practiceSeries.id })
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.bandId, ctx.bandId),
          isNull(practiceSeries.deletedAt),
        ),
      );
    for (const s of seriesRows) await this.pushSeries(ctx, s.id);
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

  private async pushGig(ctx: BandSyncContext, gigId: string): Promise<void> {
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
    const input = gigInput(g, webUrl());

    if (!g.gcalEventId) {
      if (g.date < windowStartDate()) return;
      const created = await this.calendar.createEvent(
        ctx.accessToken,
        ctx.calendarId,
        input,
      );
      await this.storeGig(g, created.id, created.etag);
      return;
    }

    let res = await this.calendar.updateEvent(
      ctx.accessToken,
      ctx.calendarId,
      g.gcalEventId,
      input,
      g.gcalEtag ?? undefined,
    );
    if (res.status === "etag-mismatch") {
      // The app write is newer than the remote edit and overwrites it.
      res = await this.calendar.updateEvent(
        ctx.accessToken,
        ctx.calendarId,
        g.gcalEventId,
        input,
      );
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
    const input = seriesInput(s, webUrl());
    let master: CalendarEvent;
    if (!s.gcalEventId) {
      master = await this.calendar.createEvent(
        ctx.accessToken,
        ctx.calendarId,
        input,
      );
      await this.storeSeries(s, master.id, master.etag);
    } else {
      const result = await this.updateMaster(ctx, s, s.gcalEventId);
      if (result === "gone") return;
      master = result;
      await this.storeSeries(s, s.gcalEventId, master.etag);
    }
    const eventId = master.id;
    await this.pushInstances(ctx, { ...s, gcalEventId: eventId });
  }

  /** Updates the master with its stored etag; returns the stored event or "gone". */
  private async updateMaster(
    ctx: BandSyncContext,
    s: SeriesRow,
    eventId: string,
  ): Promise<CalendarEvent | "gone"> {
    const patch = seriesInput(s, webUrl());
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
      // The app write wins over the remote edit.
      res = await update();
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

  /** Overrides and cancellations, patched as instance exceptions. */
  private async pushInstances(
    ctx: BandSyncContext,
    s: SeriesRow & { gcalEventId: string },
  ): Promise<void> {
    const overrides = await this.db
      .select()
      .from(overridesTable)
      .where(eq(overridesTable.seriesId, s.id));
    const targets = overrides
      .map((o) => o.originalStart)
      .sort((a, b) => a.getTime() - b.getTime());
    for (const at of targets) {
      if (!isOccurrence(s, at)) continue;
      const override = overrides.find(
        (o) => o.originalStart.getTime() === at.getTime(),
      );
      await this.patchInstance(ctx, s, at, override);
    }
  }

  private async pushOccurrence(
    ctx: BandSyncContext,
    seriesId: string,
    at: Date,
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
    await this.patchInstance(
      ctx,
      { ...s, gcalEventId: s.gcalEventId },
      at,
      override,
    );
  }

  private async patchInstance(
    ctx: BandSyncContext,
    s: SeriesRow & { gcalEventId: string },
    at: Date,
    override: OverrideRow | undefined,
  ): Promise<void> {
    const patch = override?.cancelled
      ? { cancelled: true }
      : instanceInput(s, at, override);
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

/** First gig date (YYYY-MM-DD) inside the sync window. */
function windowStartDate(now = new Date()): string {
  return new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
