import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, memberships, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { JobsService } from "../jobs/jobs.service.js";
import { testingEnabled } from "../testing/testing.enabled.js";

export const PUSH_QUEUE = "calendar-push";

export type PushKind = "gig" | "series" | "occ" | "acl";

/** One pending app-to-Google reconcile. `occ` also carries the occurrence start; `acl` has the band id as `id`. */
export interface PushJob {
  bandId: string;
  kind: PushKind;
  id: string;
  startMs?: number;
}

export const jobKey = (j: Pick<PushJob, "kind" | "id" | "startMs">): string =>
  j.startMs === undefined
    ? `${j.kind}:${j.id}`
    : `${j.kind}:${j.id}:${j.startMs}`;

/** Debounce before a queued push runs, so bursts of edits coalesce into one write. */
const PUSH_DELAY_SECONDS = 3;

/**
 * Pending pushes. The in-memory map is the authority for "what is dirty" (pulls
 * skip remote edits of dirty events and tests drain it); pg-boss gives durable,
 * retried execution of the same work.
 */
@Injectable()
export class CalendarSyncQueue {
  private readonly log = new Logger(CalendarSyncQueue.name);
  private readonly dirty = new Map<string, PushJob>();
  private readonly processed = new Set<string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jobs: JobsService,
  ) {}

  // ---- enqueue (never throws) ----

  gig(bandId: string, gigId: string): Promise<void> {
    return this.add({ bandId, kind: "gig", id: gigId });
  }

  series(bandId: string, seriesId: string): Promise<void> {
    return this.add({ bandId, kind: "series", id: seriesId });
  }

  /** An override or cancellation of one occurrence changed. */
  occurrence(bandId: string, seriesId: string, original: Date): Promise<void> {
    return this.add({
      bandId,
      kind: "occ",
      id: seriesId,
      startMs: original.getTime(),
    });
  }

  /** Reconciles who the band calendar is shared with against the active members. */
  async bandAcl(bandId: string): Promise<void> {
    await this.add({ bandId, kind: "acl", id: bandId });
  }

  /** Every set-up band the user is an active member of gets an ACL reconcile. */
  async userAcl(userId: string): Promise<void> {
    try {
      const rows = await this.db
        .select({ bandId: memberships.bandId })
        .from(memberships)
        .innerJoin(bands, eq(bands.id, memberships.bandId))
        .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)));
      await Promise.all(rows.map((r) => this.bandAcl(r.bandId)));
    } catch (err) {
      this.warn("userAcl", err);
    }
  }

  // ---- state ----

  /** Pushes not yet applied, optionally for one band. */
  pending(bandId?: string): number {
    return this.entries(bandId).length;
  }

  entries(bandId?: string): PushJob[] {
    return [...this.dirty.values()].filter(
      (j) => !bandId || j.bandId === bandId,
    );
  }

  has(key: string): boolean {
    return this.dirty.has(key);
  }

  /** True when the app has an unpushed content change for the gig. */
  gigDirty(id: string): boolean {
    return this.dirty.has(`gig:${id}`);
  }

  seriesDirty(id: string): boolean {
    return this.dirty.has(`series:${id}`);
  }

  occurrenceDirty(seriesId: string, startMs: number): boolean {
    return (
      this.dirty.has(`series:${seriesId}`) ||
      this.dirty.has(`occ:${seriesId}:${startMs}`)
    );
  }

  /** Whether a delivered job still needs work (it may have been drained already). */
  shouldRun(job: PushJob): boolean {
    const key = jobKey(job);
    return this.dirty.has(key) || !this.processed.has(key);
  }

  done(job: PushJob): void {
    const key = jobKey(job);
    this.dirty.delete(key);
    this.processed.add(key);
    // A full series push covers the occurrence pushes queued for it.
    if (job.kind === "series") {
      for (const [k, j] of this.dirty) {
        if (j.kind === "occ" && j.id === job.id) this.dirty.delete(k);
      }
    }
  }

  /** Drops all in-memory state (test reset). */
  reset(): void {
    this.dirty.clear();
    this.processed.clear();
  }

  // ---- internals ----

  private async isSetUp(bandId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ calendarId: bands.calendarId })
      .from(bands)
      .where(eq(bands.id, bandId));
    return !!row?.calendarId;
  }

  private async add(job: PushJob, checked = false): Promise<void> {
    try {
      if (!checked && !(await this.isSetUp(job.bandId))) return;
      const key = jobKey(job);
      this.dirty.set(key, job);
      this.processed.delete(key);
      // With fakes the test API drains pushes; no timers race the tests.
      if (testingEnabled()) return;
      const boss = await this.jobs.start();
      await boss.send(PUSH_QUEUE, job, {
        singletonKey: key,
        startAfter: PUSH_DELAY_SECONDS,
      });
    } catch (err) {
      this.warn("enqueue", err);
    }
  }

  private warn(what: string, err: unknown): void {
    this.log.warn(
      `calendar ${what} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
