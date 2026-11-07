import { localParts } from "../events/time.js";

/** PUBLISH is the subscription feed; REQUEST and CANCEL are the emailed invites. */
export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";
export type InviteMethod = Exclude<IcsMethod, "PUBLISH">;
export type IcsPartstat =
  "NEEDS-ACTION" | "ACCEPTED" | "TENTATIVE" | "DECLINED";

/** One VEVENT. Timed events use ISO instants; all-day events use YYYY-MM-DD with an exclusive end. */
export interface IcsEvent {
  uid: string;
  sequence: number;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  allDay: boolean;
  start: string;
  end: string;
  timeZone: string;
  /** RRULE line with or without the `RRULE:` prefix (master of a recurring series only). */
  rrule?: string | null;
  /** Original start instants of cancelled occurrences (master only). */
  exdates?: readonly string[];
  /** Original start instant when this VEVENT overrides one occurrence of a series. */
  recurrenceId?: string | null;
  organizer: { email: string; name?: string };
  attendee: { email: string; name?: string; partstat: IcsPartstat };
}

export interface BuildCalendarInput {
  method: IcsMethod;
  dtstamp: Date;
  events: readonly IcsEvent[];
  /** Omit VTIMEZONE blocks; used to fingerprint content independent of the current year. */
  omitTimezones?: boolean;
  /** Calendar display name for subscription feeds. */
  name?: string;
}

export const ICS_CONTENT_TYPE = (method: IcsMethod): string =>
  `text/calendar; method=${method}; charset=UTF-8`;

// ---- text helpers ----

export function escapeText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const quoteParam = (s: string): string => `"${s.replace(/["\r\n]/g, "")}"`;

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

// ---- date helpers ----

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
const isUtcZone = (tz: string): boolean =>
  /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/.test(tz);

function localStamp(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.year, 4)}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}00`;
}

export function utcStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** `NAME[;TZID=..]:value` for an instant in the event's zone. */
function dateTimeProp(name: string, iso: string, tz: string): string {
  const d = new Date(iso);
  return isUtcZone(tz)
    ? `${name}:${utcStamp(d)}`
    : `${name};TZID=${tz}:${localStamp(d, tz)}`;
}

// ---- VTIMEZONE ----

const offsetFmt = new Map<string, Intl.DateTimeFormat>();

/** UTC offset of `tz` at an instant, in minutes. */
export function offsetMinutes(tz: string, ms: number): number {
  let f = offsetFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    });
    offsetFmt.set(tz, f);
  }
  const name = f
    .formatToParts(ms)
    .find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

interface Transition {
  at: number;
  from: number;
  to: number;
}

const transitionCache = new Map<string, Transition[]>();
const DAY = 86_400_000;

function transitionsIn(tz: string, year: number): Transition[] {
  const key = `${tz}|${year}`;
  const hit = transitionCache.get(key);
  if (hit) return hit;
  const out: Transition[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let prevT = Date.UTC(year, 0, 1);
  let prevO = offsetMinutes(tz, prevT);
  for (let t = prevT + DAY; t <= end; t += DAY) {
    const o = offsetMinutes(tz, t);
    if (o !== prevO) {
      let lo = prevT;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMinutes(tz, mid) === prevO) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: prevO, to: o });
    }
    prevT = t;
    prevO = o;
  }
  transitionCache.set(key, out);
  return out;
}

const fmtOffset = (min: number): string =>
  `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

interface LocalTransition {
  stamp: string;
  rule: string;
  from: number;
  to: number;
}

function describe(t: Transition): LocalTransition {
  const local = new Date(t.at + t.from * 60_000);
  const dom = local.getUTCDate();
  const dim = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const nth = dom + 7 > dim ? -1 : Math.ceil(dom / 7);
  const time = `${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`;
  return {
    stamp: `${pad(local.getUTCFullYear(), 4)}${pad(local.getUTCMonth() + 1)}${pad(dom)}T${time}`,
    rule: `FREQ=YEARLY;BYMONTH=${local.getUTCMonth() + 1};BYDAY=${nth}${WEEKDAY_CODES[local.getUTCDay()]}|${time}`,
    from: t.from,
    to: t.to,
  };
}

function observance(
  kind: "STANDARD" | "DAYLIGHT",
  t: LocalTransition,
  rrule?: string,
): string[] {
  return [
    `BEGIN:${kind}`,
    `DTSTART:${t.stamp}`,
    `TZOFFSETFROM:${fmtOffset(t.from)}`,
    `TZOFFSETTO:${fmtOffset(t.to)}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `END:${kind}`,
  ];
}

/** VTIMEZONE lines for an IANA zone, valid for the given years (rule form when yearly rules are stable). */
export function vtimezone(
  tz: string,
  firstYear: number,
  lastYear: number,
): string[] {
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const perYear = years.map((y) => transitionsIn(tz, y).map(describe));
  const head = ["BEGIN:VTIMEZONE", `TZID:${tz}`];
  const tail = ["END:VTIMEZONE"];

  if (perYear.every((t) => t.length === 0)) {
    const o = offsetMinutes(tz, Date.UTC(firstYear, 0, 1));
    return [
      ...head,
      ...observance("STANDARD", {
        stamp: `${pad(firstYear, 4)}0101T000000`,
        rule: "",
        from: o,
        to: o,
      }),
      ...tail,
    ];
  }

  const first = perYear[0]!;
  const stable =
    first.length === 2 &&
    perYear.every(
      (t) =>
        t.length === 2 &&
        t.every(
          (x, i) =>
            x.rule === first[i]!.rule &&
            x.from === first[i]!.from &&
            x.to === first[i]!.to,
        ),
    );
  const kindOf = (t: LocalTransition): "STANDARD" | "DAYLIGHT" =>
    t.to > t.from ? "DAYLIGHT" : "STANDARD";

  if (stable) {
    return [
      ...head,
      ...first.flatMap((t) =>
        observance(kindOf(t), t, t.rule.slice(0, t.rule.indexOf("|"))),
      ),
      ...tail,
    ];
  }
  // Irregular rules: one dated observance per transition.
  return [
    ...head,
    ...perYear.flat().flatMap((t) => observance(kindOf(t), t)),
    ...tail,
  ];
}

// ---- calendar ----

function eventLines(method: IcsMethod, dtstamp: Date, e: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(dtstamp)}`,
  ];
  lines.push(`SEQUENCE:${e.sequence}`);
  if (e.recurrenceId) {
    lines.push(
      e.allDay
        ? `RECURRENCE-ID;VALUE=DATE:${e.recurrenceId.replace(/-/g, "")}`
        : dateTimeProp("RECURRENCE-ID", e.recurrenceId, e.timeZone),
    );
  }
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${e.end.replace(/-/g, "")}`);
  } else {
    lines.push(dateTimeProp("DTSTART", e.start, e.timeZone));
    lines.push(dateTimeProp("DTEND", e.end, e.timeZone));
  }
  if (e.rrule) {
    lines.push(e.rrule.startsWith("RRULE:") ? e.rrule : `RRULE:${e.rrule}`);
  }
  for (const x of e.exdates ?? [])
    lines.push(dateTimeProp("EXDATE", x, e.timeZone));
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  const org = e.organizer.name ? `;CN=${quoteParam(e.organizer.name)}` : "";
  lines.push(`ORGANIZER${org}:mailto:${e.organizer.email}`);
  const cn = e.attendee.name ? `;CN=${quoteParam(e.attendee.name)}` : "";
  lines.push(
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${e.attendee.partstat};RSVP=TRUE${cn}:mailto:${e.attendee.email}`,
  );
  lines.push(`STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE", "END:VEVENT");
  return lines;
}

/** RFC 5545/5546 text (CRLF, folded) for a REQUEST or CANCEL with its VTIMEZONE blocks. */
export function buildCalendar(input: BuildCalendarInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Greenroom//Calendar Invites//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    ...(input.name
      ? [
          `X-WR-CALNAME:${escapeText(input.name)}`,
          `NAME:${escapeText(input.name)}`,
        ]
      : []),
  ];
  if (!input.omitTimezones) {
    const spans = new Map<string, [number, number]>();
    for (const e of input.events) {
      if (e.allDay || isUtcZone(e.timeZone)) continue;
      const iso = [
        e.start,
        e.end,
        ...(e.exdates ?? []),
        e.recurrenceId ?? e.start,
      ];
      const years = iso.map((s) => localParts(new Date(s), e.timeZone).year);
      const span = spans.get(e.timeZone) ?? [9999, 0];
      spans.set(e.timeZone, [
        Math.min(span[0], ...years),
        Math.max(span[1], ...years),
      ]);
    }
    for (const [tz, [lo, hi]] of spans) {
      lines.push(...vtimezone(tz, lo - 1, hi + 1));
    }
  }
  for (const e of input.events) {
    lines.push(...eventLines(input.method, input.dtstamp, e));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
