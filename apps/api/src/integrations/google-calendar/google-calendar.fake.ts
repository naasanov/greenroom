import type {
  CalendarAclRule,
  CalendarChangesResult,
  CalendarDeleteResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarEventResult,
  CalendarShareResult,
  GoogleCalendarAdapter,
} from "./google-calendar.adapter.js";
import { instanceId, isDateOnly } from "./google-calendar.mapping.js";

interface CalendarState {
  events: Map<string, CalendarEvent>;
  /** Append-only log of changed event ids; the sync token is a log offset. */
  log: string[];
  /** Tokens with an offset below this value report as expired. */
  minValidOffset: number;
  /** ACL rules keyed by lowercase email. */
  acl: Map<string, CalendarAclRule>;
}

/** Owner rule every fake calendar starts with, standing in for the service account. */
export const FAKE_OWNER_EMAIL = "calendar-owner@fake.test";
/** Addresses on this domain have no Google account; sharing with them is rejected. */
export const FAKE_NON_GOOGLE_DOMAIN = "no-google.test";

export class FakeGoogleCalendarAdapter implements GoogleCalendarAdapter {
  private calendars = new Map<string, CalendarState>();
  private info = new Map<string, { summary: string; timeZone: string }>();
  private calCounter = 0;
  private eventCounter = 0;
  private writeCounter = 0;

  // ---- adapter ----

  async createCalendar(
    accessToken: string,
    input?: { summary: string; timeZone: string },
  ): Promise<{ calendarId: string }> {
    this.lastAccessToken = accessToken;
    const calendarId = `fake-cal-${++this.calCounter}@group.calendar.test`;
    if (input) this.info.set(calendarId, { ...input });
    this.calendars.set(calendarId, {
      events: new Map(),
      log: [],
      minValidOffset: 0,
      acl: new Map([
        [
          FAKE_OWNER_EMAIL,
          {
            id: `user:${FAKE_OWNER_EMAIL}`,
            email: FAKE_OWNER_EMAIL,
            role: "owner",
          },
        ],
      ]),
    });
    return { calendarId };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEvent> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const event: CalendarEvent = {
      id: `fake-evt-${++this.eventCounter}`,
      summary: input.summary,
      description: input.description ?? null,
      location: input.location ?? null,
      start: input.start,
      end: input.end,
      recurrence: input.recurrence ?? [],
      cancelled: false,
      etag: "",
      updated: "",
      allDay: input.allDay ?? isDateOnly(input.start),
      timeZone: input.timeZone ?? null,
      privateProperties: { ...input.privateProperties },
      recurringEventId: null,
      originalStart: null,
    };
    return this.write(cal, event);
  }

  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const existing = cal.events.get(eventId);
    if (!existing || existing.cancelled) return { status: "not-found" };
    if (ifMatchEtag !== undefined && ifMatchEtag !== existing.etag) {
      return { status: "etag-mismatch", event: clone(existing) };
    }
    return { status: "ok", event: this.applyPatch(cal, existing, patch) };
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<CalendarDeleteResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const existing = cal.events.get(eventId);
    if (!existing || existing.cancelled) return { status: "not-found" };
    this.write(cal, { ...existing, cancelled: true });
    return { status: "ok" };
  }

  async patchInstance(
    accessToken: string,
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): Promise<CalendarEventResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const existing = this.instance(cal, recurringEventId, originalStart);
    if (!existing) return { status: "not-found" };
    const { cancelled, ...rest } = patch;
    return {
      status: "ok",
      event: this.applyPatch(cal, existing, rest, cancelled),
    };
  }

  async listChanges(
    accessToken: string,
    calendarId: string,
    syncToken?: string,
  ): Promise<CalendarChangesResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const nextSyncToken = `fake-sync-${cal.log.length}`;
    if (syncToken === undefined) {
      const events = [...cal.events.values()]
        .filter((e) => !e.cancelled || e.recurringEventId !== null)
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

  async shareCalendar(
    accessToken: string,
    calendarId: string,
    email: string,
  ): Promise<CalendarShareResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    const key = email.toLowerCase();
    if (key.endsWith(`@${FAKE_NON_GOOGLE_DOMAIN}`)) {
      return { status: "rejected" };
    }
    if (cal.acl.has(key)) return { status: "already-shared" };
    cal.acl.set(key, { id: `user:${key}`, email, role: "reader" });
    this.shareLog.push({ calendarId, email });
    return { status: "shared" };
  }

  async listAclRules(
    accessToken: string,
    calendarId: string,
  ): Promise<CalendarAclRule[]> {
    this.lastAccessToken = accessToken;
    return this.aclRules(calendarId);
  }

  async deleteAclRule(
    accessToken: string,
    calendarId: string,
    ruleId: string,
  ): Promise<CalendarDeleteResult> {
    this.lastAccessToken = accessToken;
    const cal = this.cal(calendarId);
    for (const [key, rule] of cal.acl) {
      if (rule.id === ruleId) {
        cal.acl.delete(key);
        return { status: "ok" };
      }
    }
    return { status: "not-found" };
  }

  // ---- test controls ----

  /** Every successful share (notification sent), in order. */
  shareLog: { calendarId: string; email: string }[] = [];

  /** Current ACL rules of a calendar, owner included. */
  aclRules(calendarId: string): CalendarAclRule[] {
    return [...this.cal(calendarId).acl.values()].map((r) => ({ ...r }));
  }

  /** Simulates the owner sharing the calendar by hand in the Google UI. */
  simulateAclRule(
    calendarId: string,
    email: string,
    role: CalendarAclRule["role"] = "reader",
  ): void {
    this.cal(calendarId).acl.set(email.toLowerCase(), {
      id: `user:${email.toLowerCase()}`,
      email,
      role,
    });
  }

  /** Access token passed to the most recent adapter call. */
  lastAccessToken: string | null = null;

  /** Simulates an edit (or cancellation) of one instance in the Google Calendar UI. */
  simulateInstanceEdit(
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): void {
    const cal = this.cal(calendarId);
    const e = this.instance(cal, recurringEventId, originalStart);
    if (!e) throw new Error(`Fake Calendar: unknown event ${recurringEventId}`);
    const { cancelled, ...rest } = patch;
    this.applyPatch(cal, e, rest, cancelled);
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

  /** Name and time zone a calendar was created with. */
  calendarInfo(
    calendarId: string,
  ): { summary: string; timeZone: string } | undefined {
    return this.info.get(calendarId);
  }

  getEvent(calendarId: string, eventId: string): CalendarEvent | undefined {
    const e = this.cal(calendarId).events.get(eventId);
    return e ? clone(e) : undefined;
  }

  /** All stored events of a calendar, including cancelled ones. */
  listEvents(calendarId: string): CalendarEvent[] {
    return this.allEvents(calendarId);
  }

  allEvents(calendarId: string): CalendarEvent[] {
    return [...this.cal(calendarId).events.values()].map(clone);
  }

  reset(): void {
    this.calendars.clear();
    this.info.clear();
    this.calCounter = 0;
    this.eventCounter = 0;
    this.writeCounter = 0;
    this.lastAccessToken = null;
    this.shareLog = [];
  }

  // ---- internals ----

  /** Existing override, or a materialized copy of the parent for an instance not yet overridden. */
  private instance(
    cal: CalendarState,
    recurringEventId: string,
    originalStart: string,
  ): CalendarEvent | undefined {
    const parent = cal.events.get(recurringEventId);
    if (!parent || parent.cancelled || parent.recurrence.length === 0) {
      return undefined;
    }
    const id = instanceId(recurringEventId, originalStart);
    return (
      cal.events.get(id) ?? {
        ...clone(parent),
        id,
        recurrence: [],
        recurringEventId,
        originalStart,
      }
    );
  }

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
      updated: new Date(
        Date.UTC(2026, 0, 1) + this.writeCounter * 1000,
      ).toISOString(),
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
    if (patch.timeZone !== undefined) next.timeZone = patch.timeZone;
    if (patch.allDay !== undefined) next.allDay = patch.allDay;
    else if (patch.start !== undefined) next.allDay = isDateOnly(patch.start);
    if (patch.privateProperties !== undefined) {
      next.privateProperties = {
        ...next.privateProperties,
        ...patch.privateProperties,
      };
    }
    if (cancelled !== undefined) next.cancelled = cancelled;
    return this.write(cal, next);
  }
}

function clone(e: CalendarEvent): CalendarEvent {
  return {
    ...e,
    recurrence: [...e.recurrence],
    privateProperties: { ...e.privateProperties },
  };
}

function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined;
}
