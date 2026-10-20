export const GOOGLE_CALENDAR = Symbol("GOOGLE_CALENDAR");

export type AttendeeResponse =
  "accepted" | "tentative" | "declined" | "needsAction";

export interface CalendarAttendee {
  email: string;
  responseStatus: AttendeeResponse;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** ISO 8601 date-time. */
  start: string;
  end: string;
  /** RRULE lines such as "RRULE:FREQ=WEEKLY;BYDAY=TU". Empty for non-recurring. */
  recurrence: string[];
  attendees: CalendarAttendee[];
  /** True when the event was deleted/cancelled. */
  cancelled: boolean;
  /** Changes on every write. */
  etag: string;
  /** Set on instances of a recurring event. */
  recurringEventId: string | null;
  /** Original start of the instance this event overrides. */
  originalStart: string | null;
}

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  recurrence?: string[];
  /** Attendee emails; new attendees start as needsAction. */
  attendeeEmails?: string[];
}

export type CalendarEventPatch = Partial<CalendarEventInput>;

export type CalendarEventResult =
  | { status: "ok"; event: CalendarEvent }
  | { status: "not-found" }
  | { status: "etag-mismatch"; event: CalendarEvent };

export type CalendarDeleteResult = { status: "ok" } | { status: "not-found" };

export type CalendarChangesResult =
  | { status: "ok"; events: CalendarEvent[]; nextSyncToken: string }
  | { status: "sync-token-expired" };

export interface GoogleCalendarAdapter {
  createCalendar(input: {
    summary: string;
    timeZone: string;
  }): Promise<{ calendarId: string }>;
  createEvent(
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEvent>;
  /** Optional ifMatchEtag yields etag-mismatch when the event changed remotely. */
  updateEvent(
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult>;
  deleteEvent(
    calendarId: string,
    eventId: string,
  ): Promise<CalendarDeleteResult>;
  /** Overrides one instance of a recurring event, identified by its original start. */
  patchInstance(
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): Promise<CalendarEventResult>;
  /** Omit syncToken for a full sync (returns all live events). */
  listChanges(
    calendarId: string,
    syncToken?: string,
  ): Promise<CalendarChangesResult>;
}
