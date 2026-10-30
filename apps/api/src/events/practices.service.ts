import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gte, isNull } from "drizzle-orm";
import {
  memberships,
  practiceOccurrenceOverrides as overridesTable,
  practiceRsvps,
  practiceSeries,
  practiceSetlistAssignments as assignmentsTable,
  setlists,
  users,
  type Database,
} from "@greenroom/db";
import {
  EVENT_ERROR_CODES,
  type Attendee,
  type ClearPracticeSetlistQuery,
  type CreatePractice,
  type CreatePracticeSetlist,
  type EditScope,
  type PracticeEditResult,
  type PracticeOccurrence,
  type PracticeSeries,
  type PracticeSetlistResult,
  type RsvpStatus,
  type SetPracticeSetlist,
  type UpdatePractice,
} from "@greenroom/shared";
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { DRIZZLE } from "../db/db.constants.js";
import { copyItems } from "../setlists/items.js";
import { resolveAssignment, startsHere } from "./assignment.js";
import {
  buildOccurrence,
  type OverrideRow,
  type SeriesRow,
} from "./occurrences.js";
import {
  assertGcalRepresentable,
  buildRrule,
  firstOccurrence,
  isOccurrence,
  occurrencesBefore,
  parseRecurrence,
  ruleCount,
  truncateRrule,
  withCount,
} from "./recurrence.js";
import {
  isValidTimeZone,
  localDate,
  localTime,
  parseOccurrenceKey,
  toOccurrenceKey,
  zonedInstant,
} from "./time.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;
const RSVP_ORDER: Record<RsvpStatus, number> = {
  going: 0,
  maybe: 1,
  no_response: 2,
  not_going: 3,
};

export function toSeries(s: SeriesRow): PracticeSeries {
  return {
    id: s.id,
    bandId: s.bandId,
    title: s.title,
    location: s.location,
    rrule: s.rrule,
    recurrence: parseRecurrence(s.rrule, s.timeZone),
    startDate: localDate(s.dtstart, s.timeZone),
    startTime: localTime(s.dtstart, s.timeZone),
    dtstart: s.dtstart.toISOString(),
    timeZone: s.timeZone,
    durationMinutes: s.durationMinutes,
    createdAt: s.createdAt.toISOString(),
  };
}

const notFound = (): NotFoundException =>
  new NotFoundException({
    message: "Occurrence not found",
    code: EVENT_ERROR_CODES.invalidOccurrence,
  });

@Injectable()
export class PracticesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly calendarSync: CalendarSyncQueue,
  ) {}

  // ---- lookups ----

  private async findSeries(
    bandId: string,
    seriesId: string,
    db: Database | Tx = this.db,
  ): Promise<SeriesRow> {
    if (!UUID_RE.test(seriesId))
      throw new NotFoundException("Practice not found");
    const [row] = await db
      .select()
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.id, seriesId),
          eq(practiceSeries.bandId, bandId),
          isNull(practiceSeries.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException("Practice not found");
    return row;
  }

  private async findOverride(
    seriesId: string,
    original: Date,
    db: Database | Tx = this.db,
  ): Promise<OverrideRow | undefined> {
    const [row] = await db
      .select()
      .from(overridesTable)
      .where(
        and(
          eq(overridesTable.seriesId, seriesId),
          eq(overridesTable.originalStart, original),
        ),
      );
    return row;
  }

  /** The occurrence's original start, validated against the series rule. */
  private async requireOccurrence(
    series: SeriesRow,
    key: string,
    opts: { allowCancelled?: boolean } = {},
  ): Promise<{ original: Date; override: OverrideRow | undefined }> {
    const original = parseOccurrenceKey(key);
    if (!original || !isOccurrence(series, original)) throw notFound();
    const override = await this.findOverride(series.id, original);
    if (override?.cancelled && !opts.allowCancelled) throw notFound();
    return { original, override };
  }

  // ---- reads ----

  async getSeries(bandId: string, seriesId: string): Promise<PracticeSeries> {
    return toSeries(await this.findSeries(bandId, seriesId));
  }

  async getOccurrence(
    bandId: string,
    userId: string,
    seriesId: string,
    key: string,
  ): Promise<PracticeOccurrence> {
    const series = await this.findSeries(bandId, seriesId);
    const { original, override } = await this.requireOccurrence(series, key);
    return this.detail(series, original, override, userId);
  }

  private async attendees(
    bandId: string,
    seriesId: string,
    original: Date,
  ): Promise<Attendee[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: practiceRsvps.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        practiceRsvps,
        and(
          eq(practiceRsvps.userId, memberships.userId),
          eq(practiceRsvps.seriesId, seriesId),
          eq(practiceRsvps.originalStart, original),
        ),
      )
      .where(and(eq(memberships.bandId, bandId), isNull(memberships.leftAt)));
    return rows
      .map((r) => ({ ...r, status: r.status ?? ("no_response" as RsvpStatus) }))
      .sort(
        (a, b) =>
          RSVP_ORDER[a.status] - RSVP_ORDER[b.status] ||
          a.displayName.localeCompare(b.displayName) ||
          a.userId.localeCompare(b.userId),
      );
  }

  private async detail(
    series: SeriesRow,
    original: Date,
    override: OverrideRow | undefined,
    userId: string,
  ): Promise<PracticeOccurrence> {
    const [attendees, rows] = await Promise.all([
      this.attendees(series.bandId, series.id, original),
      this.db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.seriesId, series.id)),
    ]);
    const resolved = resolveAssignment(rows, original);
    const occ = buildOccurrence(series, original, override);
    return {
      ...occ,
      durationMinutes: Math.round(
        (new Date(occ.endsAt).getTime() - new Date(occ.startsAt).getTime()) /
          MINUTE_MS,
      ),
      attendees,
      myRsvp:
        attendees.find((a) => a.userId === userId)?.status ?? "no_response",
      setlistId: resolved.setlistId,
      setlistSource: resolved.source,
      setlistStartsHere: startsHere(resolved, original),
      laterCustomSetlists: laterCustom(rows, original),
    };
  }

  // ---- create ----

  async create(
    bandId: string,
    userId: string,
    body: CreatePractice,
  ): Promise<PracticeSeries> {
    if (!isValidTimeZone(body.timeZone)) {
      throw new BadRequestException("Unknown time zone");
    }
    const rrule = buildRrule(body.recurrence, body.startDate, body.timeZone);
    assertGcalRepresentable(rrule);
    const first = firstOccurrence(
      rrule,
      body.startDate,
      body.startTime,
      body.timeZone,
    );
    if (!first) throw new BadRequestException("Recurrence has no occurrences");
    const [row] = await this.db
      .insert(practiceSeries)
      .values({
        bandId,
        title: body.title,
        location: body.location ?? null,
        rrule,
        dtstart: first,
        timeZone: body.timeZone,
        durationMinutes: body.durationMinutes,
        createdByUserId: userId,
      })
      .returning();
    await this.calendarSync.series(bandId, row!.id);
    return toSeries(row!);
  }

  // ---- edit ----

  async update(
    bandId: string,
    userId: string,
    seriesId: string,
    key: string,
    patch: UpdatePractice,
  ): Promise<PracticeEditResult> {
    const series = await this.findSeries(bandId, seriesId);
    const { original, override } = await this.requireOccurrence(series, key);
    if (patch.timeZone !== undefined && !isValidTimeZone(patch.timeZone)) {
      throw new BadRequestException("Unknown time zone");
    }

    if (patch.scope === "this") {
      await this.editThis(series, original, override, patch);
      await this.calendarSync.occurrence(bandId, series.id, original);
      const fresh = await this.findOverride(series.id, original);
      return {
        series: toSeries(series),
        occurrence: await this.detail(series, original, fresh, userId),
      };
    }

    const splits =
      patch.scope === "this_and_following" &&
      original.getTime() !== series.dtstart.getTime();
    const result = splits
      ? await this.splitAndEdit(series, original, patch)
      : await this.editAll(series, patch);

    await this.calendarSync.series(bandId, series.id);
    if (splits) await this.calendarSync.series(bandId, result.series.id);

    const target = splits ? result.first : original;
    const occurrence = isOccurrence(result.series, target)
      ? await this.detail(
          result.series,
          target,
          await this.findOverride(result.series.id, target),
          userId,
        )
      : null;
    return { series: toSeries(result.series), occurrence };
  }

  private async editThis(
    series: SeriesRow,
    original: Date,
    override: OverrideRow | undefined,
    patch: UpdatePractice,
  ): Promise<void> {
    const current = buildOccurrence(series, original, override);
    const curStart = new Date(current.startsAt);
    const curDuration = Math.round(
      (new Date(current.endsAt).getTime() - curStart.getTime()) / MINUTE_MS,
    );
    const timeTouched =
      patch.startDate !== undefined ||
      patch.startTime !== undefined ||
      patch.durationMinutes !== undefined;
    let startsAt = override?.startsAt ?? null;
    let endsAt = override?.endsAt ?? null;
    if (timeTouched) {
      startsAt = zonedInstant(
        patch.startDate ?? localDate(curStart, series.timeZone),
        patch.startTime ?? localTime(curStart, series.timeZone),
        series.timeZone,
      );
      endsAt = new Date(
        startsAt.getTime() + (patch.durationMinutes ?? curDuration) * MINUTE_MS,
      );
    }
    const values = {
      cancelled: false,
      startsAt,
      endsAt,
      title: patch.title ?? override?.title ?? null,
      // An empty string records "no location" for this occurrence only.
      location:
        patch.location === undefined
          ? (override?.location ?? null)
          : (patch.location ?? ""),
    };
    await this.db
      .insert(overridesTable)
      .values({
        bandId: series.bandId,
        seriesId: series.id,
        originalStart: original,
        ...values,
      })
      .onConflictDoUpdate({
        target: [overridesTable.seriesId, overridesTable.originalStart],
        set: values,
      });
  }

  private async editAll(
    series: SeriesRow,
    patch: UpdatePractice,
  ): Promise<{ series: SeriesRow; first: Date }> {
    const tz = patch.timeZone ?? series.timeZone;
    const curDate = localDate(series.dtstart, series.timeZone);
    const curTime = localTime(series.dtstart, series.timeZone);
    const startDate = patch.startDate ?? curDate;
    const startTime = patch.startTime ?? curTime;
    const rrule = patch.recurrence
      ? buildRrule(patch.recurrence, startDate, tz)
      : series.rrule;
    assertGcalRepresentable(rrule);
    const first = firstOccurrence(rrule, startDate, startTime, tz);
    if (!first) throw new BadRequestException("Recurrence has no occurrences");
    const scheduleChanged =
      first.getTime() !== series.dtstart.getTime() ||
      tz !== series.timeZone ||
      rrule !== series.rrule;

    const row = await this.db.transaction(async (tx) => {
      if (scheduleChanged) {
        await tx
          .delete(overridesTable)
          .where(eq(overridesTable.seriesId, series.id));
      }
      const [updated] = await tx
        .update(practiceSeries)
        .set({
          title: patch.title ?? series.title,
          location:
            patch.location === undefined ? series.location : patch.location,
          rrule,
          dtstart: first,
          timeZone: tz,
          durationMinutes: patch.durationMinutes ?? series.durationMinutes,
        })
        .where(eq(practiceSeries.id, series.id))
        .returning();
      return updated!;
    });
    return { series: row, first };
  }

  /** Ends the old rule before `original` and starts a new series from it. */
  private async splitAndEdit(
    series: SeriesRow,
    original: Date,
    patch: UpdatePractice,
  ): Promise<{ series: SeriesRow; first: Date }> {
    const tz = patch.timeZone ?? series.timeZone;
    const kept = occurrencesBefore(series, original);
    const last = kept[kept.length - 1]!;
    const total = ruleCount(series.rrule);
    const startDate = localDate(original, series.timeZone);
    const origTime = localTime(original, series.timeZone);
    const startTime = patch.startTime ?? origTime;
    const newRrule = patch.recurrence
      ? buildRrule(patch.recurrence, startDate, tz)
      : total !== null
        ? withCount(series.rrule, total - kept.length)
        : series.rrule;
    assertGcalRepresentable(newRrule);
    const first = firstOccurrence(newRrule, startDate, startTime, tz);
    if (!first) throw new BadRequestException("Recurrence has no occurrences");
    const scheduleChanged =
      startTime !== origTime || tz !== series.timeZone || !!patch.recurrence;

    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(practiceSeries)
        .set({ rrule: truncateRrule(series.rrule, last) })
        .where(eq(practiceSeries.id, series.id));
      const [created] = await tx
        .insert(practiceSeries)
        .values({
          bandId: series.bandId,
          title: patch.title ?? series.title,
          location:
            patch.location === undefined ? series.location : patch.location,
          rrule: newRrule,
          dtstart: first,
          timeZone: tz,
          durationMinutes: patch.durationMinutes ?? series.durationMinutes,
          createdByUserId: series.createdByUserId,
        })
        .returning();
      await this.moveTail(tx, series, created!, original, scheduleChanged);
      return created!;
    });
    return { series: row, first };
  }

  /** Re-homes per-occurrence rows at or after `from` onto the new series. */
  private async moveTail(
    tx: Tx,
    old: SeriesRow,
    next: SeriesRow,
    from: Date,
    scheduleChanged: boolean,
  ): Promise<void> {
    const assignments = await tx
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.seriesId, old.id));
    const resolved = resolveAssignment(
      assignments.filter((a) => a.scope === "forward"),
      from,
    );
    const tailAssignments = assignments.filter((a) => a.effectiveFrom >= from);

    if (scheduleChanged) {
      // Keys no longer line up with the new slots, so single rows cannot carry over.
      await tx
        .delete(overridesTable)
        .where(
          and(
            eq(overridesTable.seriesId, old.id),
            gte(overridesTable.originalStart, from),
          ),
        );
      await tx
        .delete(practiceRsvps)
        .where(
          and(
            eq(practiceRsvps.seriesId, old.id),
            gte(practiceRsvps.originalStart, from),
          ),
        );
      await tx
        .delete(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.seriesId, old.id),
            gte(assignmentsTable.effectiveFrom, from),
            eq(assignmentsTable.scope, "single"),
          ),
        );
    } else {
      await tx
        .update(overridesTable)
        .set({ seriesId: next.id })
        .where(
          and(
            eq(overridesTable.seriesId, old.id),
            gte(overridesTable.originalStart, from),
          ),
        );
      await tx
        .update(practiceRsvps)
        .set({ seriesId: next.id })
        .where(
          and(
            eq(practiceRsvps.seriesId, old.id),
            gte(practiceRsvps.originalStart, from),
          ),
        );
      await tx
        .update(assignmentsTable)
        .set({ seriesId: next.id })
        .where(
          and(
            eq(assignmentsTable.seriesId, old.id),
            gte(assignmentsTable.effectiveFrom, from),
            eq(assignmentsTable.scope, "single"),
          ),
        );
    }
    await tx
      .update(assignmentsTable)
      .set({ seriesId: next.id })
      .where(
        and(
          eq(assignmentsTable.seriesId, old.id),
          gte(assignmentsTable.effectiveFrom, from),
          eq(assignmentsTable.scope, "forward"),
        ),
      );
    // The setlist in force at the split point keeps applying in the new series.
    const forwardAtSplit = tailAssignments.some(
      (a) =>
        a.scope === "forward" && a.effectiveFrom.getTime() === from.getTime(),
    );
    if (
      resolved.source === "forward" &&
      resolved.setlistId &&
      !forwardAtSplit
    ) {
      await tx.insert(assignmentsTable).values({
        bandId: old.bandId,
        seriesId: next.id,
        effectiveFrom: from,
        scope: "forward",
        setlistId: resolved.setlistId,
      });
    }
  }

  // ---- delete ----

  async remove(
    bandId: string,
    seriesId: string,
    key: string,
    scope: EditScope,
  ): Promise<void> {
    const series = await this.findSeries(bandId, seriesId);
    const { original } = await this.requireOccurrence(series, key, {
      allowCancelled: true,
    });

    if (scope === "this") {
      await this.db
        .insert(overridesTable)
        .values({
          bandId,
          seriesId,
          originalStart: original,
          cancelled: true,
        })
        .onConflictDoUpdate({
          target: [overridesTable.seriesId, overridesTable.originalStart],
          set: { cancelled: true },
        });
      await this.calendarSync.occurrence(bandId, seriesId, original);
      return;
    }

    if (scope === "all" || original.getTime() === series.dtstart.getTime()) {
      await this.db
        .update(practiceSeries)
        .set({ deletedAt: new Date() })
        .where(eq(practiceSeries.id, seriesId));
      await this.calendarSync.series(bandId, seriesId);
      return;
    }

    const kept = occurrencesBefore(series, original);
    await this.db.transaction(async (tx) => {
      await tx
        .update(practiceSeries)
        .set({ rrule: truncateRrule(series.rrule, kept[kept.length - 1]!) })
        .where(eq(practiceSeries.id, seriesId));
      await tx
        .delete(overridesTable)
        .where(
          and(
            eq(overridesTable.seriesId, seriesId),
            gte(overridesTable.originalStart, original),
          ),
        );
      await tx
        .delete(practiceRsvps)
        .where(
          and(
            eq(practiceRsvps.seriesId, seriesId),
            gte(practiceRsvps.originalStart, original),
          ),
        );
      await tx
        .delete(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.seriesId, seriesId),
            gte(assignmentsTable.effectiveFrom, original),
          ),
        );
    });
    await this.calendarSync.series(bandId, seriesId);
  }

  // ---- RSVP ----

  async setRsvp(
    bandId: string,
    userId: string,
    seriesId: string,
    key: string,
    status: RsvpStatus,
  ): Promise<PracticeOccurrence> {
    const series = await this.findSeries(bandId, seriesId);
    const { original, override } = await this.requireOccurrence(series, key);
    await this.db
      .insert(practiceRsvps)
      .values({ bandId, seriesId, originalStart: original, userId, status })
      .onConflictDoUpdate({
        target: [
          practiceRsvps.seriesId,
          practiceRsvps.originalStart,
          practiceRsvps.userId,
        ],
        set: { status },
      });
    return this.detail(series, original, override, userId);
  }

  // ---- setlist assignment ----

  async setSetlist(
    bandId: string,
    seriesId: string,
    key: string,
    body: SetPracticeSetlist,
  ): Promise<PracticeSetlistResult> {
    const series = await this.findSeries(bandId, seriesId);
    const { original } = await this.requireOccurrence(series, key);
    const [setlist] = await this.db
      .select({ id: setlists.id })
      .from(setlists)
      .where(and(eq(setlists.id, body.setlistId), eq(setlists.bandId, bandId)));
    if (!setlist) throw new NotFoundException("Setlist not found");
    return this.db.transaction((tx) =>
      this.applyAssignment(
        tx,
        bandId,
        seriesId,
        original,
        body.setlistId,
        body,
      ),
    );
  }

  /** Makes a new setlist (optionally pre-filled) and assigns it like `setSetlist`. */
  async createSetlist(
    bandId: string,
    seriesId: string,
    key: string,
    body: CreatePracticeSetlist,
  ): Promise<PracticeSetlistResult & { newSetlistId: string }> {
    const series = await this.findSeries(bandId, seriesId);
    const { original } = await this.requireOccurrence(series, key);
    if (body.sourceSetlistId) {
      const [src] = await this.db
        .select({ id: setlists.id })
        .from(setlists)
        .where(
          and(
            eq(setlists.id, body.sourceSetlistId),
            eq(setlists.bandId, bandId),
          ),
        );
      if (!src) throw new NotFoundException("Setlist not found");
    }
    return this.db.transaction(async (tx) => {
      let sourceId = body.sourceSetlistId ?? null;
      if (!sourceId && body.copyCurrent) {
        const rows = await tx
          .select()
          .from(assignmentsTable)
          .where(eq(assignmentsTable.seriesId, seriesId));
        sourceId = resolveAssignment(rows, original).setlistId;
      }
      const [created] = await tx
        .insert(setlists)
        .values({ bandId })
        .returning();
      if (sourceId) await copyItems(tx, sourceId, created!.id, "replace");
      const result = await this.applyAssignment(
        tx,
        bandId,
        seriesId,
        original,
        created!.id,
        body,
      );
      return { ...result, newSetlistId: created!.id };
    });
  }

  /**
   * Removes the occurrence's setlist. A null marker row is written only when an
   * earlier forward row would otherwise keep applying.
   */
  async clearSetlist(
    bandId: string,
    seriesId: string,
    key: string,
    body: ClearPracticeSetlistQuery,
  ): Promise<PracticeSetlistResult> {
    const series = await this.findSeries(bandId, seriesId);
    const { original } = await this.requireOccurrence(series, key);
    return this.db.transaction((tx) =>
      this.applyAssignment(tx, bandId, seriesId, original, null, body),
    );
  }

  /** Writes (or, with a null setlist, clears) the assignment for one occurrence. */
  private async applyAssignment(
    tx: Tx,
    bandId: string,
    seriesId: string,
    original: Date,
    setlistId: string | null,
    opts: {
      scope: "this" | "this_and_following";
      onConflict: "replace" | "keep";
    },
  ): Promise<PracticeSetlistResult> {
    const before = await tx
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.seriesId, seriesId));
    const conflicts = laterCustom(before, original);
    const scope = opts.scope === "this" ? "single" : "forward";
    const replace = opts.onConflict === "replace";
    const clearing = setlistId === null;

    if (opts.scope === "this_and_following") {
      // Rows at the occurrence are always superseded; later rows only with replace.
      await tx
        .delete(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.seriesId, seriesId),
            replace
              ? gte(assignmentsTable.effectiveFrom, original)
              : eq(assignmentsTable.effectiveFrom, original),
          ),
        );
    } else if (clearing) {
      await tx
        .delete(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.seriesId, seriesId),
            eq(assignmentsTable.scope, "single"),
            eq(assignmentsTable.effectiveFrom, original),
          ),
        );
    }

    let write = !clearing;
    if (clearing) {
      const rest = await tx
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.seriesId, seriesId));
      write = resolveAssignment(rest, original).setlistId !== null;
    }
    if (write) {
      await tx
        .insert(assignmentsTable)
        .values({
          bandId,
          seriesId,
          effectiveFrom: original,
          scope,
          setlistId,
        })
        .onConflictDoUpdate({
          target: [
            assignmentsTable.seriesId,
            assignmentsTable.effectiveFrom,
            assignmentsTable.scope,
          ],
          set: { setlistId },
        });
    }

    const after = await tx
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.seriesId, seriesId));
    const resolved = resolveAssignment(after, original);
    return {
      setlistId: resolved.setlistId,
      source: resolved.setlistId ? resolved.source : null,
      setlistStartsHere: startsHere(resolved, original),
      conflicts: opts.scope === "this" ? [] : conflicts,
      conflictsReplaced: opts.scope === "this_and_following" && replace,
    };
  }
}

function laterCustom(
  rows: readonly {
    scope: string;
    effectiveFrom: Date;
    setlistId: string | null;
  }[],
  original: Date,
) {
  return (
    rows
      .filter((r) => r.effectiveFrom > original)
      // A single row wins over a forward row starting at the same occurrence.
      .sort(
        (a, b) =>
          a.effectiveFrom.getTime() - b.effectiveFrom.getTime() ||
          (a.scope === "single" ? -1 : 1) - (b.scope === "single" ? -1 : 1),
      )
      .filter(
        (r, i, all) =>
          i === 0 ||
          r.effectiveFrom.getTime() !== all[i - 1]!.effectiveFrom.getTime(),
      )
      .map((r) => ({
        occurrenceKey: toOccurrenceKey(r.effectiveFrom),
        originalStart: r.effectiveFrom.toISOString(),
        setlistId: r.setlistId,
      }))
  );
}
