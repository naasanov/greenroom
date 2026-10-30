import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect } from "../src/fixtures.js";
import type { FakeCalendarEvent, TestApi } from "../src/test-api.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const AVA = "ava@example.com";
export const BEN = "ben@example.com";
export const BEN_CAL = "ben.outlook@example.com";

export async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

export type Client = Awaited<ReturnType<typeof client>>;

/** A band created by Ava; `join` adds more members through the invite link. */
export async function newBand(testApi: TestApi) {
  const ava = await client(testApi, AVA);
  const band = await (
    await ava.api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const bandId = band.id as string;
  const join = async (email: string): Promise<Client> => {
    const c = await client(testApi, email);
    const invite = await (await ava.api.get(`/bands/${bandId}/invite`)).json();
    const res = await c.api.post(`/invites/${invite.token}/accept`);
    expect(res.status()).toBe(200);
    return c;
  };
  return { ava, bandId, join };
}

export async function setupCalendar(
  api: APIRequestContext,
  bandId: string,
): Promise<Json> {
  const res = await api.post(
    `/bands/${bandId}/integrations/google/calendar/setup`,
    { data: { timeZone: "UTC" } },
  );
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

/** YYYY-MM-DD, `offset` days from today (UTC). */
export const dateIn = (offset: number): string =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

/** The first Tuesday on or after `minOffset` days from today (UTC). */
export function nextTuesday(minOffset: number): string {
  const d = new Date(`${dateIn(minOffset)}T00:00:00Z`);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Start of the k-th weekly occurrence for a series starting on `startDate` at 19:00 UTC. */
export const occurrence = (startDate: string, k: number, hour = 19): Date =>
  new Date(
    new Date(`${startDate}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() +
      k * 7 * DAY_MS,
  );

export const keyOf = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export async function createGig(
  api: APIRequestContext,
  bandId: string,
  data: Json = {},
): Promise<Json> {
  const res = await api.post(`/bands/${bandId}/gigs`, {
    data: {
      title: "Club Night",
      date: dateIn(10),
      startTime: "20:00",
      endTime: "23:00",
      timeZone: "UTC",
      ...data,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export async function createPractice(
  api: APIRequestContext,
  bandId: string,
  startDate: string,
  data: Json = {},
): Promise<Json> {
  const res = await api.post(`/bands/${bandId}/practices`, {
    data: {
      title: "Practice",
      startDate,
      startTime: "19:00",
      durationMinutes: 120,
      timeZone: "UTC",
      recurrence: { freq: "weekly", byWeekday: ["TU"] },
      ...data,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export const masterOf = (
  events: FakeCalendarEvent[],
  appId: string,
): FakeCalendarEvent => {
  const e = events.find(
    (x) => x.privateProperties["greenroomId"] === appId && !x.recurringEventId,
  );
  if (!e) throw new Error(`No Google event for ${appId}`);
  return e;
};

export const instanceOf = (
  events: FakeCalendarEvent[],
  masterId: string,
  start: Date,
): FakeCalendarEvent | undefined =>
  events.find(
    (x) =>
      x.recurringEventId === masterId &&
      !!x.originalStart &&
      new Date(x.originalStart).getTime() === start.getTime(),
  );

export const statusOf = (ev: FakeCalendarEvent, email: string) =>
  ev.attendees.find((a) => a.email === email)?.responseStatus;

export const emailsOf = (ev: FakeCalendarEvent): string[] =>
  ev.attendees.map((a) => a.email).sort();

/** Set up and return the calendar id for a band. */
export async function connect(
  api: APIRequestContext,
  bandId: string,
): Promise<string> {
  return (await setupCalendar(api, bandId))["calendarId"] as string;
}
