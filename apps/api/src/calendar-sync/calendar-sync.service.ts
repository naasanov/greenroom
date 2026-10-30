import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { eq, isNotNull } from "drizzle-orm";
import { bands, calendarSyncStates, type Database } from "@greenroom/db";
import {
  CALENDAR_SYNC_ERROR_CODES,
  type CalendarSetupResult,
  type CalendarSyncStatus,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  GOOGLE_CALENDAR,
  type GoogleCalendarAdapter,
} from "../integrations/index.js";
import {
  SyncContextService,
  type BandSyncContext,
} from "./calendar-sync.context.js";
import { CalendarBotTokenService } from "./calendar-bot-token.service.js";
import { CalendarAclService } from "./calendar-sync.acl.js";
import { CalendarPullService } from "./calendar-sync.pull.js";
import { CalendarPushService } from "./calendar-sync.push.js";
import {
  CalendarSyncQueue,
  jobKey,
  type PushJob,
} from "./calendar-sync.queue.js";

/**
 * Entry point for every sync action. All work runs one at a time per process, so
 * a push never interleaves with a pull of the same band.
 */
@Injectable()
export class CalendarSyncService {
  private readonly log = new Logger(CalendarSyncService.name);
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_CALENDAR) private readonly calendar: GoogleCalendarAdapter,
    private readonly bot: CalendarBotTokenService,
    private readonly contexts: SyncContextService,
    private readonly queue: CalendarSyncQueue,
    private readonly push: CalendarPushService,
    private readonly pull: CalendarPullService,
    private readonly acl: CalendarAclService,
  ) {}

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  // ---- setup ----

  /**
   * Creates the band's calendar when missing, shares it with the active members,
   * takes a sync token, and pushes every gig and practice. Safe to call again.
   */
  setup(bandId: string, timeZone: string): Promise<CalendarSetupResult> {
    return this.locked(async () => {
      const token = await this.bot.getAccessToken();
      if (!token) {
        throw new ConflictException({
          code: CALENDAR_SYNC_ERROR_CODES.botNotConfigured,
          message: "The calendar service account is not configured",
        });
      }
      const [band] = await this.db
        .select({ name: bands.name, calendarId: bands.calendarId })
        .from(bands)
        .where(eq(bands.id, bandId));
      if (!band) throw new ConflictException("Band not found");

      let calendarId = band.calendarId;
      if (!calendarId) {
        const created = await this.calendar.createCalendar(token, {
          summary: band.name,
          timeZone,
        });
        calendarId = created.calendarId;
        await this.db
          .update(bands)
          .set({ calendarId })
          .where(eq(bands.id, bandId));
        await this.db
          .delete(calendarSyncStates)
          .where(eq(calendarSyncStates.bandId, bandId));
      }
      const ctx = (await this.contexts.get(bandId))!;
      await this.acl.reconcile(ctx);

      const [state] = await this.db
        .select()
        .from(calendarSyncStates)
        .where(eq(calendarSyncStates.bandId, bandId));
      if (state?.syncToken) {
        await this.pull.pullBand(ctx);
      } else {
        // The token is taken before pushing, so nothing written next is missed.
        const res = await this.calendar.listChanges(token, calendarId);
        if (res.status !== "ok") throw new Error("Calendar sync failed");
        await this.pull.saveState(bandId, res.nextSyncToken);
      }
      const counts = await this.push.pushAll(ctx);
      for (const job of this.queue.entries(bandId)) this.queue.done(job);
      return {
        calendarId,
        ...counts,
        lastSyncedAt: (await this.status(bandId)).lastSyncedAt,
      };
    });
  }

  // ---- push ----

  /** Runs one delivered queue job unless a drain already handled it. */
  runJob(job: PushJob): Promise<void> {
    return this.locked(async () => {
      if (!this.queue.shouldRun(job)) return;
      await this.process(job);
    });
  }

  /** Applies every pending push, for one band or all. Throws the first failure after trying all. */
  flush(bandId?: string): Promise<void> {
    return this.locked(() => this.flushUnlocked(bandId));
  }

  private async flushUnlocked(bandId?: string): Promise<void> {
    let failure: unknown;
    const ctxs = new Map<string, BandSyncContext | null>();
    for (const job of this.queue.entries(bandId)) {
      // A job may already be covered by an earlier push in this drain.
      if (!this.queue.has(jobKey(job))) continue;
      try {
        await this.process(job, ctxs);
      } catch (err) {
        failure ??= err;
        this.log.warn(
          `calendar push ${job.kind} ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (failure) throw failure;
  }

  private async process(
    job: PushJob,
    cache: Map<string, BandSyncContext | null> = new Map(),
  ): Promise<void> {
    if (!cache.has(job.bandId)) {
      cache.set(job.bandId, await this.contexts.get(job.bandId));
    }
    const ctx = cache.get(job.bandId);
    // A band without a calendar (or without a service account key) has nothing to push.
    if (ctx) await this.push.run(ctx, job);
    this.queue.done(job);
  }

  // ---- pull ----

  /** Pulls Google changes for the band, then pushes anything still pending. */
  syncBand(bandId: string): Promise<void> {
    return this.locked(async () => {
      const ctx = await this.contexts.get(bandId);
      if (!ctx) return;
      await this.pull.pullBand(ctx);
      await this.flushUnlocked(bandId);
    });
  }

  /** The scheduled pass: every band with a calendar. */
  async syncAll(): Promise<void> {
    const rows = await this.db
      .select({ id: bands.id })
      .from(bands)
      .where(isNotNull(bands.calendarId));
    for (const { id: bandId } of rows) {
      try {
        await this.syncBand(bandId);
      } catch (err) {
        this.log.warn(
          `calendar sync of band ${bandId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ---- status ----

  async status(bandId: string): Promise<CalendarSyncStatus> {
    const [state] = await this.db
      .select({ at: calendarSyncStates.lastSyncedAt })
      .from(calendarSyncStates)
      .where(eq(calendarSyncStates.bandId, bandId));
    return {
      lastSyncedAt: state?.at?.toISOString() ?? null,
      pending: this.queue.pending(bandId),
    };
  }
}
