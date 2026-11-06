import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { memberships, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { JobsService } from "../jobs/jobs.service.js";
import { testingEnabled } from "../testing/testing.enabled.js";

export const INVITE_QUEUE = "calendar-invites";

/** `band` reconciles every upcoming event of the band (membership changes, catch-up). */
export type InviteJobKind = "gig" | "series" | "band";

export interface InviteJob {
  bandId: string;
  kind: InviteJobKind;
  id: string;
}

export const inviteJobKey = (j: Pick<InviteJob, "kind" | "id">): string =>
  `${j.kind}:${j.id}`;

/** Debounce before invites go out, so bursts of edits send one email per recipient. */
const INVITE_DELAY_SECONDS = 30;

/**
 * Pending invite reconciles. The in-memory map is the authority for what is dirty
 * (tests drain it); pg-boss gives durable, retried execution of the same work.
 */
@Injectable()
export class CalendarInviteQueue {
  private readonly log = new Logger(CalendarInviteQueue.name);
  private readonly dirty = new Map<string, InviteJob>();
  private readonly processed = new Set<string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jobs: JobsService,
  ) {}

  // ---- enqueue (never throws) ----

  gig(bandId: string, gigId: string): Promise<void> {
    return this.add({ bandId, kind: "gig", id: gigId });
  }

  /** A series, one of its occurrences, or its deletion changed. */
  series(bandId: string, seriesId: string): Promise<void> {
    return this.add({ bandId, kind: "series", id: seriesId });
  }

  band(bandId: string): Promise<void> {
    return this.add({ bandId, kind: "band", id: bandId });
  }

  /** Every band the user is an active member of is reconciled (calendar email or opt-in change). */
  async user(userId: string): Promise<void> {
    try {
      const rows = await this.db
        .select({ bandId: memberships.bandId })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)));
      await Promise.all(rows.map((r) => this.band(r.bandId)));
    } catch (err) {
      this.warn("user", err);
    }
  }

  // ---- state ----

  entries(bandId?: string): InviteJob[] {
    return [...this.dirty.values()].filter(
      (j) => !bandId || j.bandId === bandId,
    );
  }

  pending(bandId?: string): number {
    return this.entries(bandId).length;
  }

  has(key: string): boolean {
    return this.dirty.has(key);
  }

  /** Whether a delivered job still needs work (a drain may have handled it). */
  shouldRun(job: InviteJob): boolean {
    const key = inviteJobKey(job);
    return this.dirty.has(key) || !this.processed.has(key);
  }

  done(job: InviteJob): void {
    const key = inviteJobKey(job);
    this.dirty.delete(key);
    this.processed.add(key);
  }

  /** Marks a failed job dirty again; pg-boss redelivers it, and test drains retry it. */
  requeue(job: InviteJob): void {
    const key = inviteJobKey(job);
    this.dirty.set(key, job);
    this.processed.delete(key);
  }

  /** Drops all in-memory state (test reset). */
  reset(): void {
    this.dirty.clear();
    this.processed.clear();
  }

  // ---- internals ----

  private async add(job: InviteJob): Promise<void> {
    try {
      const key = inviteJobKey(job);
      this.dirty.set(key, job);
      this.processed.delete(key);
      // With fakes the test API drains the queue; no timers race the tests.
      if (testingEnabled()) return;
      const boss = await this.jobs.start();
      await boss.send(INVITE_QUEUE, job, {
        singletonKey: key,
        startAfter: INVITE_DELAY_SECONDS,
      });
    } catch (err) {
      this.warn("enqueue", err);
    }
  }

  private warn(what: string, err: unknown): void {
    this.log.warn(
      `calendar invite ${what} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
