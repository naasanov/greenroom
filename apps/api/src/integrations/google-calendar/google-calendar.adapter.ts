export const GOOGLE_CALENDAR = Symbol("GOOGLE_CALENDAR");

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** ISO 8601 date-time, or YYYY-MM-DD when allDay. */
  start: string;
  end: string;
  /** RRULE lines such as "RRULE:FREQ=WEEKLY;BYDAY=TU". Empty for non-recurring. */
  recurrence: string[];
  /** True when the event was deleted/cancelled. */
  cancelled: boolean;
  /** Changes on every write. */
  etag: string;
  /** ISO 8601 time of the last write. */
  updated: string;
  /** True when start/end are YYYY-MM-DD dates (end exclusive). */
  allDay: boolean;
  /** IANA zone the event was created in, when Google reports one. */
  timeZone: string | null;
  /** Google extendedProperties.private; carries app ids such as greenroomKind. */
  privateProperties: Record<string, string>;
  /** Set on instances of a recurring event. */
  recurringEventId: string | null;
  /** Original start of the instance this event overrides (date-time or YYYY-MM-DD). */
  originalStart: string | null;
}

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  /** ISO 8601 date-time, or YYYY-MM-DD when allDay. */
  start: string;
  /** Exclusive when allDay, like Google. */
  end: string;
  /** IANA zone; Google requires it for recurring events. */
  timeZone?: string;
  /** When true, start/end are YYYY-MM-DD dates. Inferred from the format when omitted. */
  allDay?: boolean;
  /** Stored as extendedProperties.private; patches merge keys. */
  privateProperties?: Record<string, string>;
  recurrence?: string[];
}

export type CalendarEventPatch = Partial<CalendarEventInput>;

export type CalendarEventResult =
  | { status: "ok"; event: CalendarEvent }
  | { status: "not-found" }
  | { status: "etag-mismatch"; event: CalendarEvent };

export type CalendarDeleteResult = { status: "ok" } | { status: "not-found" };

export interface CalendarAclRule {
  /** Google rule id, `user:<email>` for user scopes. */
  id: string;
  email: string;
  role: "owner" | "writer" | "reader" | "freeBusyReader";
}

export type CalendarShareResult =
  { status: "shared" } | { status: "already-shared" } | { status: "rejected" };

export type CalendarChangesResult =
  | { status: "ok"; events: CalendarEvent[]; nextSyncToken: string }
  | { status: "sync-token-expired" };

/**
 * Every method takes the calendar owner's (service account) access token first.
 * Events carry no attendees; members get the calendar itself through ACL rules.
 * Instance ids are `${recurringEventId}_${YYYYMMDDTHHMMSSZ}` (UTC), or
 * `_${YYYYMMDD}` for all-day events.
 */
export interface GoogleCalendarAdapter {
  createCalendar(
    accessToken: string,
    input: { summary: string; timeZone: string },
  ): Promise<{ calendarId: string }>;
  createEvent(
    accessToken: string,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEvent>;
  /** Optional ifMatchEtag yields etag-mismatch when the event changed remotely. */
  updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult>;
  deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<CalendarDeleteResult>;
  /** Overrides one instance of a recurring event, identified by its original start. */
  patchInstance(
    accessToken: string,
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): Promise<CalendarEventResult>;
  /**
   * Omit syncToken for a full sync (live events plus cancelled instance
   * overrides). Cancelled events are included in incremental results.
   */
  listChanges(
    accessToken: string,
    calendarId: string,
    syncToken?: string,
  ): Promise<CalendarChangesResult>;
  /** Grants a user read access and emails them the share (sendNotifications). */
  shareCalendar(
    accessToken: string,
    calendarId: string,
    email: string,
  ): Promise<CalendarShareResult>;
  listAclRules(
    accessToken: string,
    calendarId: string,
  ): Promise<CalendarAclRule[]>;
  /** Removes one rule by id; reports whether it existed. */
  deleteAclRule(
    accessToken: string,
    calendarId: string,
    ruleId: string,
  ): Promise<CalendarDeleteResult>;
}
