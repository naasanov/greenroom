import type { calendar_v3 } from "@googleapis/calendar";
import type {
  CalendarEvent,
  CalendarEventInput,
} from "./google-calendar.adapter.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

/**
 * Id of one instance of a recurring event: UTC basic format for timed
 * events (`_20261110T190000Z`), `_YYYYMMDD` for all-day events.
 */
export function instanceId(
  recurringEventId: string,
  originalStart: string,
): string {
  if (isDateOnly(originalStart)) {
    return `${recurringEventId}_${originalStart.replace(/-/g, "")}`;
  }
  const utc = new Date(originalStart).toISOString();
  return `${recurringEventId}_${utc.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
}

function toGoogleTime(
  value: string,
  allDay: boolean | undefined,
  timeZone: string | undefined,
): calendar_v3.Schema$EventDateTime {
  if (allDay ?? isDateOnly(value)) {
    return { date: value, dateTime: null, ...(timeZone ? { timeZone } : {}) };
  }
  return { dateTime: value, date: null, ...(timeZone ? { timeZone } : {}) };
}

/** Builds an events.insert/patch body from an input or patch. */
export function buildEventBody(
  input: Partial<CalendarEventInput> & { cancelled?: boolean },
): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;
  if (input.start !== undefined) {
    body.start = toGoogleTime(input.start, input.allDay, input.timeZone);
  }
  if (input.end !== undefined) {
    body.end = toGoogleTime(input.end, input.allDay, input.timeZone);
  }
  if (input.recurrence !== undefined) body.recurrence = input.recurrence;
  if (input.privateProperties !== undefined) {
    body.extendedProperties = { private: input.privateProperties };
  }
  if (input.cancelled !== undefined) {
    body.status = input.cancelled ? "cancelled" : "confirmed";
  }
  return body;
}

/** Maps a Google Calendar event resource to CalendarEvent. */
export function mapCalendarEvent(raw: calendar_v3.Schema$Event): CalendarEvent {
  const start = raw.start?.dateTime ?? raw.start?.date ?? "";
  const end = raw.end?.dateTime ?? raw.end?.date ?? "";
  return {
    id: raw.id ?? "",
    summary: raw.summary ?? "",
    description: raw.description ?? null,
    location: raw.location ?? null,
    start,
    end,
    recurrence: raw.recurrence ?? [],
    cancelled: raw.status === "cancelled",
    etag: raw.etag ?? "",
    updated: raw.updated ?? "",
    allDay: !raw.start?.dateTime && !!raw.start?.date,
    timeZone: raw.start?.timeZone ?? null,
    privateProperties: { ...(raw.extendedProperties?.private ?? {}) },
    recurringEventId: raw.recurringEventId ?? null,
    originalStart:
      raw.originalStartTime?.dateTime ?? raw.originalStartTime?.date ?? null,
  };
}
