import { TZDate } from "@date-fns/tz";

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local wall-clock date and time in `tz` as parts. */
export function localParts(instant: Date, tz: string) {
  const d = new TZDate(instant.getTime(), tz);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    weekday: d.getDay(),
  };
}

export function localDate(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTime(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** The instant at which the wall clock in `tz` reads `date` `time`. */
export function zonedInstant(
  date: string,
  time: string | null,
  tz: string,
): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = (time ?? "00:00").split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, tz).getTime());
}

/** `date` shifted by whole calendar days (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** URL-safe `YYYYMMDDTHHMMSSZ` form of a UTC instant. */
export function toOccurrenceKey(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

const KEY_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export function parseOccurrenceKey(key: string): Date | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return toOccurrenceKey(date) === key ? date : null;
}
