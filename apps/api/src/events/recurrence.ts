import { BadRequestException } from "@nestjs/common";
import rrulePkg from "rrule";
import {
  EVENT_ERROR_CODES,
  WEEKDAYS,
  type Recurrence,
  type Weekday,
} from "@greenroom/shared";
import { addDays, localDate, localParts, zonedInstant } from "./time.js";

const { RRule } = rrulePkg;

const DAY_MS = 24 * 60 * 60 * 1000;
const RRULE_PREFIX = "RRULE:";
const ALLOWED_KEYS = new Set([
  "freq",
  "interval",
  "byweekday",
  "bymonthday",
  "count",
  "until",
  "wkst",
]);

const unsupported = (message: string): BadRequestException =>
  new BadRequestException({
    message,
    code: EVENT_ERROR_CODES.unsupportedRecurrence,
  });

const formatUntil = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

/** `UNTIL=` clause for an instant, in the UTC form Google Calendar requires. */
export const untilClause = (d: Date): string => `UNTIL=${formatUntil(d)}`;

/**
 * Builds the RRULE line (no DTSTART) for a recurrence anchored at a local start.
 * `until` end dates include the whole local day in `tz`.
 */
export function buildRrule(
  rec: Recurrence,
  startDate: string,
  tz: string,
): string {
  const startInstant = zonedInstant(startDate, "00:00", tz);
  const wd = localParts(startInstant, tz).weekday;
  const startWeekday = WEEKDAYS[(wd + 6) % 7] as Weekday;
  const parts: string[] = [];

  if (rec.freq === "none") {
    return `${RRULE_PREFIX}FREQ=DAILY;COUNT=1`;
  }
  if (rec.freq === "weekly") {
    parts.push("FREQ=WEEKLY");
    if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
    const days = [...new Set(rec.byWeekday ?? [startWeekday])].sort(
      (a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b),
    );
    parts.push(`BYDAY=${days.join(",")}`);
  } else {
    parts.push("FREQ=MONTHLY");
    if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
    const dom = Number(startDate.slice(8, 10));
    if ((rec.monthlyMode ?? "dayOfMonth") === "dayOfMonth") {
      parts.push(`BYMONTHDAY=${dom}`);
    } else {
      const nth = Math.ceil(dom / 7);
      parts.push(`BYDAY=${nth >= 5 ? -1 : nth}${startWeekday}`);
    }
  }

  if (rec.end.type === "count") parts.push(`COUNT=${rec.end.count}`);
  if (rec.end.type === "until") {
    if (rec.end.date < startDate) {
      throw new BadRequestException("End date is before the start date");
    }
    const endOfDay = zonedInstant(addDays(rec.end.date, 1), "00:00", tz);
    parts.push(untilClause(new Date(endOfDay.getTime() - 1000)));
  }
  return RRULE_PREFIX + parts.join(";");
}

/** Throws unless the rule uses only features Google Calendar can round-trip. */
export function assertGcalRepresentable(rrule: string): void {
  if (!rrule.startsWith(RRULE_PREFIX)) throw unsupported("Not an RRULE line");
  let opts: ReturnType<typeof RRule.parseString>;
  try {
    opts = RRule.parseString(rrule);
  } catch {
    throw unsupported("Unparseable RRULE");
  }
  for (const key of Object.keys(opts)) {
    if (!ALLOWED_KEYS.has(key))
      throw unsupported(`Unsupported RRULE part ${key}`);
  }
  if (opts.count != null && opts.until != null) {
    throw unsupported("COUNT and UNTIL cannot both be set");
  }
  const { freq } = opts;
  if (freq === RRule.DAILY) {
    if (opts.count !== 1) throw unsupported("Only one-off daily rules");
  } else if (freq !== RRule.WEEKLY && freq !== RRule.MONTHLY) {
    throw unsupported("Only weekly and monthly recurrence is supported");
  }
}

/** Reads a stored RRULE back into the structured recurrence the UI edits. */
export function parseRecurrence(rrule: string, tz: string): Recurrence {
  const opts = RRule.parseString(rrule);
  const end: Recurrence["end"] =
    opts.count != null
      ? { type: "count", count: opts.count }
      : opts.until
        ? { type: "until", date: localDate(opts.until, tz) }
        : { type: "never" };
  const interval = opts.interval ?? 1;
  if (opts.freq === RRule.DAILY) {
    return { freq: "none", interval: 1, end: { type: "never" } };
  }
  const wds = (Array.isArray(opts.byweekday) ? opts.byweekday : []) as Array<{
    weekday: number;
    n?: number;
  }>;
  if (opts.freq === RRule.WEEKLY) {
    return {
      freq: "weekly",
      interval,
      byWeekday: wds.map((w) => WEEKDAYS[w.weekday] as Weekday),
      end,
    };
  }
  return {
    freq: "monthly",
    interval,
    monthlyMode: wds.some((w) => w.n) ? "nthWeekday" : "dayOfMonth",
    end,
  };
}

export interface ExpandableSeries {
  rrule: string;
  dtstart: Date;
  timeZone: string;
}

/** Local wall-clock of an instant encoded as a UTC date, for rrule's floating math. */
function floating(instant: Date, tz: string): Date {
  const p = localParts(instant, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0));
}

function toInstant(float: Date, tz: string): Date {
  return zonedInstant(
    float.toISOString().slice(0, 10),
    float.toISOString().slice(11, 16),
    tz,
  );
}

function buildRule(s: ExpandableSeries, dtstart: Date) {
  const opts = RRule.parseString(s.rrule);
  const until = opts.until ?? null;
  delete opts.until;
  opts.dtstart = floating(dtstart, s.timeZone);
  return { rule: new RRule(opts), until, count: opts.count ?? null };
}

/**
 * Occurrence instants within [from, to] (inclusive). The rule runs on the series'
 * local wall clock so DST changes never shift local times.
 */
export function occurrencesBetween(
  s: ExpandableSeries,
  from: Date,
  to: Date,
): Date[] {
  if (to < from) return [];
  const { rule, until } = buildRule(s, s.dtstart);
  const lo = new Date(from.getTime() - DAY_MS);
  const hi = new Date(to.getTime() + DAY_MS);
  const out: Date[] = [];
  for (const f of rule.between(lo, hi, true)) {
    const inst = toInstant(f, s.timeZone);
    if (inst < from || inst > to) continue;
    if (until && inst > until) continue;
    out.push(inst);
  }
  return out;
}

/** Instants of occurrences strictly before `before`, oldest first. */
export function occurrencesBefore(s: ExpandableSeries, before: Date): Date[] {
  return occurrencesBetween(s, s.dtstart, new Date(before.getTime() - 1));
}

export function isOccurrence(s: ExpandableSeries, instant: Date): boolean {
  return occurrencesBetween(s, instant, instant).length === 1;
}

/** First occurrence on or after the given local start, or null if the rule yields none. */
export function firstOccurrence(
  rrule: string,
  startDate: string,
  startTime: string,
  tz: string,
): Date | null {
  const candidate = zonedInstant(startDate, startTime, tz);
  const { rule, until } = buildRule(
    { rrule, dtstart: candidate, timeZone: tz },
    candidate,
  );
  const f = rule.after(floating(candidate, tz), true);
  if (!f) return null;
  const inst = toInstant(f, tz);
  return until && inst > until ? null : inst;
}

/** Rule with COUNT/UNTIL replaced by an inclusive UNTIL at `last`. */
export function truncateRrule(rrule: string, last: Date): string {
  const kept = rrule
    .slice(RRULE_PREFIX.length)
    .split(";")
    .filter((p) => !p.startsWith("COUNT=") && !p.startsWith("UNTIL="));
  return `${RRULE_PREFIX}${[...kept, untilClause(last)].join(";")}`;
}

/** Rule with COUNT set to `count` (UNTIL dropped). */
export function withCount(rrule: string, count: number): string {
  const kept = rrule
    .slice(RRULE_PREFIX.length)
    .split(";")
    .filter((p) => !p.startsWith("COUNT=") && !p.startsWith("UNTIL="));
  return `${RRULE_PREFIX}${[...kept, `COUNT=${count}`].join(";")}`;
}

export const ruleCount = (rrule: string): number | null =>
  RRule.parseString(rrule).count ?? null;

export const ruleUntil = (rrule: string): Date | null =>
  RRule.parseString(rrule).until ?? null;
