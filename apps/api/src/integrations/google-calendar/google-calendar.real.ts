import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
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
import {
  buildEventBody,
  instanceId,
  mapCalendarEvent,
} from "./google-calendar.mapping.js";

const PAGE_SIZE = 250;
const ROLES: readonly CalendarAclRule["role"][] = [
  "owner",
  "writer",
  "reader",
  "freeBusyReader",
];

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
  const client = new auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return calendar({ version: "v3", auth: client });
}

/** Talks to Calendar v3 with the caller's access token; events have no attendees. */
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

  async shareCalendar(
    accessToken: string,
    calendarId: string,
    email: string,
  ): Promise<CalendarShareResult> {
    try {
      await calendarFor(accessToken).acl.insert({
        calendarId,
        sendNotifications: true,
        requestBody: { role: "reader", scope: { type: "user", value: email } },
      });
      return { status: "shared" };
    } catch (err) {
      const s = httpStatus(err);
      if (s === 409) return { status: "already-shared" };
      // Addresses Google cannot resolve to an account are refused with a 4xx.
      if (s === 400 || s === 404) return { status: "rejected" };
      throw err;
    }
  }

  async listAclRules(
    accessToken: string,
    calendarId: string,
  ): Promise<CalendarAclRule[]> {
    const cal = calendarFor(accessToken);
    const out: CalendarAclRule[] = [];
    let pageToken: string | undefined;
    do {
      const res: { data: calendar_v3.Schema$Acl } = await cal.acl.list({
        calendarId,
        maxResults: PAGE_SIZE,
        pageToken,
      });
      for (const r of res.data.items ?? []) {
        const role = ROLES.find((x) => x === r.role);
        if (r.id && r.scope?.type === "user" && r.scope.value && role) {
          out.push({ id: r.id, email: r.scope.value, role });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async deleteAclRule(
    accessToken: string,
    calendarId: string,
    ruleId: string,
  ): Promise<CalendarDeleteResult> {
    try {
      await calendarFor(accessToken).acl.delete({ calendarId, ruleId });
      return { status: "ok" };
    } catch (err) {
      const s = httpStatus(err);
      if (s === 404 || s === 410) return { status: "not-found" };
      throw err;
    }
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
      const res = await cal.events.patch(
        {
          calendarId,
          eventId,
          requestBody: buildEventBody(patch),
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
