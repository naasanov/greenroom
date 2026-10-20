import type {
  practiceOccurrenceOverrides,
  practiceSeries,
} from "@greenroom/db";
import type { PracticeEvent } from "@greenroom/shared";
import { occurrencesBetween, ruleCount } from "./recurrence.js";
import { localDate, toOccurrenceKey } from "./time.js";

export type SeriesRow = typeof practiceSeries.$inferSelect;
export type OverrideRow = typeof practiceOccurrenceOverrides.$inferSelect;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const isRecurring = (s: SeriesRow): boolean => ruleCount(s.rrule) !== 1;

/** The calendar event for the occurrence generated at `originalStart`, overrides applied. */
export function buildOccurrence(
  s: SeriesRow,
  originalStart: Date,
  o: OverrideRow | undefined,
): PracticeEvent {
  const startsAt = o?.startsAt ?? originalStart;
  const endsAt =
    o?.endsAt ?? new Date(startsAt.getTime() + s.durationMinutes * MINUTE_MS);
  const key = toOccurrenceKey(originalStart);
  return {
    type: "practice",
    id: `${s.id}_${key}`,
    seriesId: s.id,
    originalStart: originalStart.toISOString(),
    occurrenceKey: key,
    title: o?.title ?? s.title,
    location: o?.location != null ? o.location || null : s.location,
    date: localDate(startsAt, s.timeZone),
    allDay: false,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: s.timeZone,
    recurring: isRecurring(s),
    modified: o != null,
  };
}

/**
 * Non-cancelled occurrences of one series overlapping [from, to], including ones moved
 * into the range from outside it. `overrides` must cover the series for that span.
 */
export function expandSeries(
  s: SeriesRow,
  overrides: readonly OverrideRow[],
  from: Date,
  to: Date,
): PracticeEvent[] {
  const byStart = new Map(overrides.map((o) => [o.originalStart.getTime(), o]));
  const seen = new Set<number>();
  const out: PracticeEvent[] = [];
  const push = (original: Date, o: OverrideRow | undefined): void => {
    if (o?.cancelled) return;
    const ev = buildOccurrence(s, original, o);
    const start = new Date(ev.startsAt);
    const end = new Date(ev.endsAt);
    if (start < to && (end > from || start >= from)) out.push(ev);
  };

  const base = occurrencesBetween(s, new Date(from.getTime() - DAY_MS), to);
  for (const original of base) {
    seen.add(original.getTime());
    push(original, byStart.get(original.getTime()));
  }
  for (const o of overrides) {
    if (seen.has(o.originalStart.getTime()) || !o.startsAt) continue;
    push(o.originalStart, o);
  }
  return out;
}
