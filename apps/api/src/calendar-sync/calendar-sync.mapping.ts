import type { gigs } from "@greenroom/db";
import type { RsvpStatus } from "@greenroom/shared";
import type {
  AttendeeResponse,
  CalendarEventInput,
  CalendarEventPatch,
} from "../integrations/index.js";
import type { OverrideRow, SeriesRow } from "../events/occurrences.js";
import { buildOccurrence } from "../events/occurrences.js";
import { addDays, localTime } from "../events/time.js";

type GigRow = typeof gigs.$inferSelect;

export const SYNC_PAST_DAYS = 30;
export const SYNC_FUTURE_DAYS = 365;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
/** Length used for timed gigs that have a start but no end. */
export const DEFAULT_GIG_MINUTES = 120;

export const KIND_GIG = "gig";
export const KIND_PRACTICE = "practice";

export function syncWindow(now = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - SYNC_PAST_DAYS * DAY_MS),
    to: new Date(now.getTime() + SYNC_FUTURE_DAYS * DAY_MS),
  };
}

// ---- RSVP <-> attendee response ----

const TO_GOOGLE: Record<RsvpStatus, AttendeeResponse> = {
  going: "accepted",
  maybe: "tentative",
  not_going: "declined",
  no_response: "needsAction",
};

export const toGoogleResponse = (s: RsvpStatus): AttendeeResponse =>
  TO_GOOGLE[s];

export function fromGoogleResponse(r: AttendeeResponse): RsvpStatus {
  if (r === "accepted") return "going";
  if (r === "tentative") return "maybe";
  if (r === "declined") return "not_going";
  return "no_response";
}

// ---- members ----

export interface SyncMember {
  userId: string;
  /** Calendar email, else sign-in email. */
  email: string;
}

export const sameEmail = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

export function attendeeEmails(members: readonly SyncMember[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of members) {
    const k = m.email.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m.email);
  }
  return out;
}

// ---- gigs ----

/** Venue name and address joined as Google's single location string. */
export function gigLocation(g: {
  venueName: string | null;
  address: string | null;
}): string | null {
  const parts = [g.venueName, g.address].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Google end for a gig: all-day uses an exclusive end date. */
export function gigTimes(g: GigRow): {
  allDay: boolean;
  start: string;
  end: string;
} {
  if (g.allDay || !g.startsAt) {
    return { allDay: true, start: g.date, end: addDays(g.date, 1) };
  }
  const end =
    g.endsAt ??
    new Date(g.startsAt.getTime() + DEFAULT_GIG_MINUTES * MINUTE_MS);
  return {
    allDay: false,
    start: g.startsAt.toISOString(),
    end: end.toISOString(),
  };
}

export function gigInput(
  g: GigRow,
  emails: string[],
  webUrl: string,
): CalendarEventInput {
  const t = gigTimes(g);
  const lines = [g.notes?.trim() || null];
  if (g.loadInAt) lines.push(`Load-in: ${localTime(g.loadInAt, g.timeZone)}`);
  lines.push(`${webUrl}/gigs/${g.id}`);
  return {
    summary: g.title,
    description: lines.filter((l): l is string => !!l).join("\n\n"),
    location: gigLocation(g),
    start: t.start,
    end: t.end,
    allDay: t.allDay,
    timeZone: g.timeZone,
    privateProperties: { greenroomKind: KIND_GIG, greenroomId: g.id },
    attendeeEmails: emails,
  };
}

// ---- practices ----

export function seriesInput(
  s: SeriesRow,
  emails: string[],
  webUrl: string,
): CalendarEventInput {
  return {
    summary: s.title,
    description: `${webUrl}/practices/${s.id}`,
    location: s.location,
    start: s.dtstart.toISOString(),
    end: new Date(
      s.dtstart.getTime() + s.durationMinutes * MINUTE_MS,
    ).toISOString(),
    allDay: false,
    timeZone: s.timeZone,
    recurrence: [s.rrule],
    privateProperties: { greenroomKind: KIND_PRACTICE, greenroomId: s.id },
    attendeeEmails: emails,
  };
}

/** Full content of one instance (overrides applied), plus attendee statuses. */
export function instanceInput(
  s: SeriesRow,
  original: Date,
  override: OverrideRow | undefined,
  emails: string[],
  responses: Record<string, AttendeeResponse>,
): CalendarEventPatch {
  const occ = buildOccurrence(s, original, override);
  return {
    summary: occ.title,
    location: occ.location,
    start: occ.startsAt,
    end: occ.endsAt,
    allDay: false,
    timeZone: s.timeZone,
    attendeeEmails: emails,
    attendeeResponses: responses,
  };
}

/** The single RRULE line of a Google recurrence, or null when absent or ambiguous. */
export function singleRrule(recurrence: readonly string[]): string | null {
  const rules = recurrence.filter((l) => l.toUpperCase().startsWith("RRULE:"));
  return rules.length === 1 ? rules[0]! : null;
}
