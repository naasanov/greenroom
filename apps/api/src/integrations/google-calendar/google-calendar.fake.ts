import type {
  AttendeeResponse,
  CalendarChangesResult,
  CalendarDeleteResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarEventResult,
  GoogleCalendarAdapter,
} from "./google-calendar.adapter.js";

interface CalendarState {
  events: Map<string, CalendarEvent>;
  /** Append-only log of changed event ids; the sync token is a log offset. */
  log: string[];
  /** Tokens with an offset below this value report as expired. */
  minValidOffset: number;
}

export class FakeGoogleCalendarAdapter implements GoogleCalendarAdapter {
  private calendars = new Map<string, CalendarState>();
  private calCounter = 0;
  private eventCounter = 0;
  private writeCounter = 0;

  // ---- adapter ----

  async createCalendar(): Promise<{ calendarId: string }> {
    const calendarId = `fake-cal-${++this.calCounter}@group.calendar.test`;
    this.calendars.set(calendarId, {
      events: new Map(),
      log: [],
      minValidOffset: 0,
    });
    return { calendarId };
  }

  async createEvent(
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEvent> {
    const cal = this.cal(calendarId);
    const event: CalendarEvent = {
      id: `fake-evt-${++this.eventCounter}`,
      summary: input.summary,
      description: input.description ?? null,
      location: input.location ?? null,
      start: input.start,
      end: input.end,
      recurrence: input.recurrence ?? [],
      attendees: (input.attendeeEmails ?? []).map((email) => ({
        email,
        responseStatus: "needsAction" as const,
      })),
      cancelled: false,
      etag: "",
      recurringEventId: null,
      originalStart: null,
    };
    return this.write(cal, event);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult> {
    const cal = this.cal(calendarId);
    const existing = cal.events.get(eventId);
    if (!existing || existing.cancelled) return { status: "not-found" };
    if (ifMatchEtag !== undefined && ifMatchEtag !== existing.etag) {
      return { status: "etag-mismatch", event: clone(existing) };
    }
    return { status: "ok", event: this.applyPatch(cal, existing, patch) };
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
  ): Promise<CalendarDeleteResult> {
    const cal = this.cal(calendarId);
    const existing = cal.events.get(eventId);
    if (!existing || existing.cancelled) return { status: "not-found" };
    this.write(cal, { ...existing, cancelled: true });
    return { status: "ok" };
  }

  async patchInstance(
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): Promise<CalendarEventResult> {
    const cal = this.cal(calendarId);
    const parent = cal.events.get(recurringEventId);
    if (!parent || parent.cancelled || parent.recurrence.length === 0) {
      return { status: "not-found" };
    }
    const id = `${recurringEventId}_${originalStart.replace(/[-:.]/g, "")}`;
    const existing: CalendarEvent = cal.events.get(id) ?? {
      ...clone(parent),
      id,
      recurrence: [],
      recurringEventId,
      originalStart,
    };
    const { cancelled, ...rest } = patch;
    return {
      status: "ok",
      event: this.applyPatch(cal, existing, rest, cancelled),
    };
  }

  async listChanges(
    calendarId: string,
    syncToken?: string,
  ): Promise<CalendarChangesResult> {
    const cal = this.cal(calendarId);
    const nextSyncToken = `fake-sync-${cal.log.length}`;
    if (syncToken === undefined) {
      const events = [...cal.events.values()]
        .filter((e) => !e.cancelled)
        .map(clone);
      return { status: "ok", events, nextSyncToken };
    }
    const offset = Number.parseInt(syncToken.replace("fake-sync-", ""), 10);
    if (Number.isNaN(offset) || offset < cal.minValidOffset) {
      return { status: "sync-token-expired" };
    }
    const ids = new Set(cal.log.slice(offset));
    const events = [...ids]
      .map((id) => cal.events.get(id))
      .filter(isDefined)
      .map(clone);
    return { status: "ok", events, nextSyncToken };
  }

  // ---- test controls ----

  /** Simulates a guest responding in Google Calendar. */
  simulateAttendeeResponse(
    calendarId: string,
    eventId: string,
    email: string,
    responseStatus: AttendeeResponse,
  ): void {
    const cal = this.cal(calendarId);
    const e = this.must(cal, eventId);
    const attendees = e.attendees.some((a) => a.email === email)
      ? e.attendees.map((a) =>
          a.email === email ? { ...a, responseStatus } : a,
        )
      : [...e.attendees, { email, responseStatus }];
    this.write(cal, { ...e, attendees });
  }

  /** Simulates an edit made in the Google Calendar UI. */
  simulateExternalEdit(
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
  ): void {
    const cal = this.cal(calendarId);
    this.applyPatch(cal, this.must(cal, eventId), patch);
  }

  simulateExternalDelete(calendarId: string, eventId: string): void {
    const cal = this.cal(calendarId);
    this.write(cal, { ...this.must(cal, eventId), cancelled: true });
  }

  /** Makes every sync token issued so far report as expired. */
  expireSyncTokens(calendarId: string): void {
    const cal = this.cal(calendarId);
    cal.minValidOffset = cal.log.length + 1;
  }

  getEvent(calendarId: string, eventId: string): CalendarEvent | undefined {
    const e = this.cal(calendarId).events.get(eventId);
    return e ? clone(e) : undefined;
  }

  allEvents(calendarId: string): CalendarEvent[] {
    return [...this.cal(calendarId).events.values()].map(clone);
  }

  reset(): void {
    this.calendars.clear();
    this.calCounter = 0;
    this.eventCounter = 0;
    this.writeCounter = 0;
  }

  // ---- internals ----

  private cal(id: string): CalendarState {
    const c = this.calendars.get(id);
    if (!c) throw new Error(`Fake Calendar: unknown calendar ${id}`);
    return c;
  }

  private must(cal: CalendarState, eventId: string): CalendarEvent {
    const e = cal.events.get(eventId);
    if (!e) throw new Error(`Fake Calendar: unknown event ${eventId}`);
    return e;
  }

  private write(cal: CalendarState, event: CalendarEvent): CalendarEvent {
    const stored = {
      ...clone(event),
      etag: `"fake-etag-${++this.writeCounter}"`,
    };
    cal.events.set(stored.id, stored);
    cal.log.push(stored.id);
    return clone(stored);
  }

  private applyPatch(
    cal: CalendarState,
    existing: CalendarEvent,
    patch: CalendarEventPatch,
    cancelled?: boolean,
  ): CalendarEvent {
    const next: CalendarEvent = clone(existing);
    if (patch.summary !== undefined) next.summary = patch.summary;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.location !== undefined) next.location = patch.location;
    if (patch.start !== undefined) next.start = patch.start;
    if (patch.end !== undefined) next.end = patch.end;
    if (patch.recurrence !== undefined) next.recurrence = patch.recurrence;
    if (patch.attendeeEmails !== undefined) {
      next.attendees = patch.attendeeEmails.map(
        (email) =>
          existing.attendees.find((a) => a.email === email) ?? {
            email,
            responseStatus: "needsAction" as const,
          },
      );
    }
    if (cancelled !== undefined) next.cancelled = cancelled;
    return this.write(cal, next);
  }
}

function clone(e: CalendarEvent): CalendarEvent {
  return {
    ...e,
    recurrence: [...e.recurrence],
    attendees: e.attendees.map((a) => ({ ...a })),
  };
}

function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined;
}
