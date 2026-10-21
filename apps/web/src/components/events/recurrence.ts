import type { Recurrence, RecurrenceEnd, Weekday } from "@greenroom/shared";

export const WEEKDAY_ORDER: Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

const LONG: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

export const WEEKDAY_INITIAL: Record<Weekday, string> = {
  MO: "M",
  TU: "T",
  WE: "W",
  TH: "T",
  FR: "F",
  SA: "S",
  SU: "S",
};

const ORDINALS = ["first", "second", "third", "fourth", "last"];

/** Weekday of a local `YYYY-MM-DD`. */
export function weekdayOf(date: string): Weekday {
  const js = new Date(`${date}T12:00:00Z`).getUTCDay();
  return WEEKDAY_ORDER[(js + 6) % 7];
}

/** "third Tuesday" for the date's position in its month. */
export function nthWeekdayLabel(date: string): string {
  const day = Number(date.slice(8, 10));
  const n = Math.min(Math.ceil(day / 7), 5) - 1;
  return `${ORDINALS[n]} ${LONG[weekdayOf(date)]}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function endLabel(end: RecurrenceEnd): string {
  if (end.type === "until") {
    const label = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${end.date}T12:00:00Z`));
    return `, until ${label}`;
  }
  if (end.type === "count") {
    return `, ${end.count} ${end.count === 1 ? "time" : "times"}`;
  }
  return "";
}

/** Human-readable rule, e.g. "Every 2 weeks on Tuesday and Thursday, until Dec 1, 2026". */
export function recurrenceSummary(r: Recurrence, startDate: string): string {
  if (r.freq === "none") return "Does not repeat";
  const interval = r.interval ?? 1;
  if (r.freq === "weekly") {
    const days = WEEKDAY_ORDER.filter((d) =>
      (r.byWeekday?.length ? r.byWeekday : [weekdayOf(startDate)]).includes(d),
    ).map((d) => LONG[d]);
    const every = interval === 1 ? "Every week" : `Every ${interval} weeks`;
    const onDays =
      interval === 1 && days.length === 1
        ? `Every ${days[0]}`
        : `${every} on ${list(days)}`;
    return `${onDays}${endLabel(r.end)}`;
  }
  const every = interval === 1 ? "Every month" : `Every ${interval} months`;
  const on =
    r.monthlyMode === "nthWeekday"
      ? `on the ${nthWeekdayLabel(startDate)}`
      : `on day ${Number(startDate.slice(8, 10))}`;
  return `${every} ${on}${endLabel(r.end)}`;
}
