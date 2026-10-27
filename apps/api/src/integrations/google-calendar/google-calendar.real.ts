import { google, type calendar_v3 } from "googleapis";
import type {
  CalendarChangesResult,
  CalendarDeleteResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarEventResult,
  GoogleCalendarAdapter,
} from "./google-calendar.adapter.js";
import {
  buildEventBody,
  instanceId,
  mapCalendarEvent,
} from "./google-calendar.mapping.js";

const PAGE_SIZE = 250;

function httpStatus(err: unknown): number | undefined {
  const e = err as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };
  for (const v of [e?.response?.status, e?.status, e?.code]) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isInteger(n)) return n;
  }
  return undefined;
}

function calendarFor(accessToken: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

/** Talks to Calendar v3 with the caller's access token; every write notifies attendees. */
export class RealGoogleCalendarAdapter implements GoogleCalendarAdapter {
  async createCalendar(
    accessToken: string,
    input: { summary: string; timeZone: string },
  ): Promise<{ calendarId: string }> {
    const res = await calendarFor(accessToken).calendars.insert({
      requestBody: { summary: input.summary, timeZone: input.timeZone },
    });
    if (!res.data.id) throw new Error("Calendar insert returned no id");
    return { calendarId: res.data.id };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEvent> {
    const res = await calendarFor(accessToken).events.insert({
      calendarId,
      sendUpdates: "all",
      requestBody: buildEventBody(input),
    });
    return mapCalendarEvent(res.data);
  }

  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch,
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult> {
    return this.patch(accessToken, calendarId, eventId, patch, ifMatchEtag);
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<CalendarDeleteResult> {
    try {
      await calendarFor(accessToken).events.delete({
        calendarId,
        eventId,
        sendUpdates: "all",
      });
      return { status: "ok" };
    } catch (err) {
      const s = httpStatus(err);
      if (s === 404 || s === 410) return { status: "not-found" };
      throw err;
    }
  }

  async patchInstance(
    accessToken: string,
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
  ): Promise<CalendarEventResult> {
    return this.patch(
      accessToken,
      calendarId,
      instanceId(recurringEventId, originalStart),
      patch,
    );
  }

  async listChanges(
    accessToken: string,
    calendarId: string,
    syncToken?: string,
  ): Promise<CalendarChangesResult> {
    const cal = calendarFor(accessToken);
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    try {
      do {
        const res: { data: calendar_v3.Schema$Events } = await cal.events.list({
          calendarId,
          syncToken,
          showDeleted: true,
          maxResults: PAGE_SIZE,
          pageToken,
        });
        for (const e of res.data.items ?? []) events.push(mapCalendarEvent(e));
        pageToken = res.data.nextPageToken ?? undefined;
        nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
    } catch (err) {
      if (httpStatus(err) === 410) return { status: "sync-token-expired" };
      throw err;
    }
    if (!nextSyncToken) throw new Error("Calendar list returned no sync token");
    // Full syncs keep cancelled instance overrides but drop deleted standalone events.
    const out =
      syncToken === undefined
        ? events.filter((e) => !e.cancelled || e.recurringEventId !== null)
        : events;
    return { status: "ok", events: out, nextSyncToken };
  }

  // ---- internals ----

  private async patch(
    accessToken: string,
    calendarId: string,
    eventId: string,
    patch: CalendarEventPatch & { cancelled?: boolean },
    ifMatchEtag?: string,
  ): Promise<CalendarEventResult> {
    const cal = calendarFor(accessToken);
    try {
      // Attendee patches replace the list, so existing responses are carried over.
      let existing: CalendarEvent["attendees"] = [];
      if (patch.attendeeEmails !== undefined) {
        const cur = await cal.events.get({ calendarId, eventId });
        existing = mapCalendarEvent(cur.data).attendees;
      }
      const res = await cal.events.patch(
        {
          calendarId,
          eventId,
          sendUpdates: "all",
          requestBody: buildEventBody(patch, existing),
        },
        ifMatchEtag ? { headers: { "If-Match": ifMatchEtag } } : undefined,
      );
      return { status: "ok", event: mapCalendarEvent(res.data) };
    } catch (err) {
      const s = httpStatus(err);
      if (s === 404 || s === 410) return { status: "not-found" };
      if (s === 412) {
        try {
          const cur = await cal.events.get({ calendarId, eventId });
          return { status: "etag-mismatch", event: mapCalendarEvent(cur.data) };
        } catch (err2) {
          if (httpStatus(err2) === 404) return { status: "not-found" };
          throw err2;
        }
      }
      throw err;
    }
  }
}
