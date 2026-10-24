import type { CalendarEvent } from "@greenroom/shared";

/** The browser's IANA zone, used for new events. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Local `YYYY-MM-DD` of an instant in a zone. */
export function zonedDate(iso: string, timeZone: string): string {
  return wallClock(iso, timeZone).date;
}

/** Wall-clock date and time of an instant in a zone. */
export function wallClock(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** "20:00" to "8:00 PM". */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "20:00" to "8p", "19:30" to "7:30p" (month chips). */
export function timeShort(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${hour}${suffix}`
    : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "Sat, Nov 7" for a local `YYYY-MM-DD`. */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

interface Timed {
  date: string;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
}

/** "8:00 PM - 10:00 PM", "8:00 PM", or null when the event has no start. */
export function timeRange(e: Timed): string | null {
  if (e.allDay || !e.startsAt) return null;
  const start = time12(wallClock(e.startsAt, e.timeZone).time);
  if (!e.endsAt) return start;
  return `${start} - ${time12(wallClock(e.endsAt, e.timeZone).time)}`;
}

/** "Sat, Nov 7, 2026" plus the time range, or "(all day)". */
export function whenLabel(e: Timed): string {
  const day = dayLabel(e.date);
  const range = timeRange(e);
  return range ? `${day}, ${range}` : `${day} (no time yet)`;
}

/** FullCalendar start/end for an API event, as wall-clock strings in the event's zone. */
export function toCalendarInput(e: CalendarEvent) {
  const base = {
    id: e.id,
    title: e.title,
    extendedProps: { event: e },
  };
  if (e.allDay || !e.startsAt) {
    return { ...base, start: e.date, allDay: true };
  }
  const start = wallClock(e.startsAt, e.timeZone);
  const end = e.endsAt ? wallClock(e.endsAt, e.timeZone) : null;
  return {
    ...base,
    start: `${start.date}T${start.time}:00`,
    end: end ? `${end.date}T${end.time}:00` : undefined,
    allDay: false,
  };
}

/** Minutes between two `HH:mm` values on the same day. */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Minutes from `start` to `end` (`HH:mm`); an end at or before the start is the next day. */
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff <= 0 ? diff + 1440 : diff;
}

/** Whole days from local date `a` to local date `b` (`YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** Local date `YYYY-MM-DD` plus `days`. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
