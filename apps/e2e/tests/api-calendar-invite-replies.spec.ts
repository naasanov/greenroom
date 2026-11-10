import { createHmac } from "node:crypto";
import { request as pwRequest } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { CalendarInviteEmail } from "../src/test-api.js";
import {
  BEN,
  BEN_CAL,
  createGig,
  createPractice,
  keyOf,
  newBand,
  nextTuesday,
  occurrence,
} from "./calendar-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

// Matches RESEND_WEBHOOK_SECRET in src/servers.ts.
const WEBHOOK_SECRET = "whsec_dGVzdC1vbmx5LXJlc2VuZC13ZWJob29rLXNlY3JldA==";

const unfold = (s: string): string => s.replace(/\r\n[ \t]/g, "");
const stamp = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

/** `rsvp+<token>@domain` from the ORGANIZER of a sent invite. */
const replyAddressOf = (m: CalendarInviteEmail): string =>
  /ORGANIZER[^:]*:mailto:(rsvp\+\S+)/.exec(unfold(m.ics))![1]!;

function replyIcs(
  seriesId: string,
  partstat: string,
  from: string,
  recurrence?: Date,
): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    `UID:series-${seriesId}@greenroom.fyi`,
    "DTSTAMP:20261101T000000Z",
    ...(recurrence ? [`RECURRENCE-ID:${stamp(recurrence)}`] : []),
    `ATTENDEE;PARTSTAT=${partstat}:mailto:${from}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function signed(body: string, ts = Math.floor(Date.now() / 1000)) {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(ts),
    "svix-signature": `v1,${sig}`,
  };
}

async function post(headers: Record<string, string>, body: string) {
  const ctx = await pwRequest.newContext({ baseURL: API_URL });
  try {
    return await ctx.post("/webhooks/resend/inbound", { headers, data: body });
  } finally {
    await ctx.dispose();
  }
}

async function setup(testApi: Parameters<typeof newBand>[0]) {
  const { ava, bandId, join } = await newBand(testApi, { invites: true });
  const ben = await join(BEN);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    title: "Weekly practice",
  });
  const sid = series.id as string;
  await testApi.calendarInvitesFlush(bandId);
  const sent = await testApi.calendarInvitesFor(undefined, true);
  const benInvite = sent.find((m) => m.to === BEN)!;
  const rsvpOf = async (c: typeof ben, k: number): Promise<string> => {
    const res = await c.api.get(
      `/bands/${bandId}/practices/${sid}/occurrences/${keyOf(occurrence(start, k))}`,
    );
    return (await res.json()).myRsvp;
  };
  return { ava, ben, bandId, sid, start, benInvite, rsvpOf };
}

test("a signed webhook with a master REPLY sets the series RSVP and sends no echo", async ({
  testApi,
}) => {
  const { ben, bandId, sid, benInvite, rsvpOf } = await setup(testApi);
  await testApi.addInboundEmail({
    emailId: "em_1",
    from: `Ben <${BEN}>`,
    recipients: [replyAddressOf(benInvite)],
    calendars: [replyIcs(sid, "ACCEPTED", BEN)],
  });
  const body = JSON.stringify({
    type: "email.received",
    data: { email_id: "em_1" },
  });
  const res = await post(signed(body), body);
  expect(res.status()).toBe(200);
  expect(await rsvpOf(ben, 0)).toBe("going");
  expect(await rsvpOf(ben, 3)).toBe("going");

  // The member's calendar already shows the answer, so no update email follows.
  await testApi.calendarInvitesFlush(bandId);
  expect(await testApi.calendarInvitesFor()).toHaveLength(0);
});

test("a RECURRENCE-ID reply changes only that occurrence", async ({
  testApi,
}) => {
  const { ben, start, sid, benInvite, rsvpOf } = await setup(testApi);
  const to = replyAddressOf(benInvite);
  expect(
    await testApi.calendarInviteReply({
      from: BEN,
      to,
      ics: replyIcs(sid, "ACCEPTED", BEN),
    }),
  ).toMatch(/^applied/);
  const outcome = await testApi.calendarInviteReply({
    from: BEN.toUpperCase(),
    to,
    ics: replyIcs(sid, "DECLINED", BEN, occurrence(start, 2)),
  });
  expect(outcome).toMatch(/^applied/);
  expect(await rsvpOf(ben, 1)).toBe("going");
  expect(await rsvpOf(ben, 2)).toBe("not_going");
  expect(await rsvpOf(ben, 3)).toBe("going");
});

test("the member is matched by calendar email and unknown senders are ignored", async ({
  testApi,
}) => {
  const { ben, bandId, sid, benInvite, rsvpOf } = await setup(testApi);
  const to = replyAddressOf(benInvite);
  const ics = replyIcs(sid, "TENTATIVE", BEN_CAL);
  const res = await ben.api.patch("/auth/me", {
    data: { calendarEmail: BEN_CAL },
  });
  expect(res.ok(), await res.text()).toBe(true);
  expect(await testApi.calendarInviteReply({ from: BEN_CAL, to, ics })).toMatch(
    /^applied/,
  );
  expect(await rsvpOf(ben, 0)).toBe("maybe");

  for (const from of ["stranger@example.com", "ben@evil.example.com"]) {
    expect(await testApi.calendarInviteReply({ from, to, ics })).toMatch(
      /^ignored/,
    );
  }
  void bandId;
});

test("forged tokens, gig tokens and bad signatures change nothing", async ({
  testApi,
}) => {
  const { ava, ben, bandId, sid, benInvite, rsvpOf } = await setup(testApi);
  const to = replyAddressOf(benInvite);
  const ics = replyIcs(sid, "DECLINED", BEN);

  const forged = to.slice(0, -"@greenroom.fyi".length - 2) + "00@greenroom.fyi";
  expect(
    await testApi.calendarInviteReply({ from: BEN, to: forged, ics }),
  ).toMatch(/^ignored/);

  await createGig(ava.api, bandId, { title: "Gig" });
  await testApi.calendarInvitesFlush(bandId);
  const gigInvite = (await testApi.calendarInvitesFor(BEN, true)).find((m) =>
    m.subject.includes("Gig"),
  )!;
  expect(
    await testApi.calendarInviteReply({
      from: BEN,
      to: replyAddressOf(gigInvite),
      ics,
    }),
  ).toMatch(/^ignored/);
  expect(await rsvpOf(ben, 0)).toBe("no_response");

  await testApi.addInboundEmail({
    emailId: "em_2",
    from: BEN,
    recipients: [to],
    calendars: [ics],
  });
  const body = JSON.stringify({
    type: "email.received",
    data: { email_id: "em_2" },
  });
  expect(
    (await post({ "content-type": "application/json" }, body)).status(),
  ).toBe(401);
  const tampered = signed(body);
  tampered["svix-signature"] = "v1,AAAA" + tampered["svix-signature"].slice(7);
  expect((await post(tampered, body)).status()).toBe(401);
  const old = signed(body, Math.floor(Date.now() / 1000) - 3600);
  expect((await post(old, body)).status()).toBe(401);
  expect((await post(signed(body + " "), body)).status()).toBe(401);
  expect(await rsvpOf(ben, 0)).toBe("no_response");
});

test("an RSVP made in the app sends only that member an updated PARTSTAT, once", async ({
  testApi,
}) => {
  const { ben, bandId, sid, start, benInvite, rsvpOf } = await setup(testApi);
  expect(benInvite.ics).toContain("PARTSTAT=NEEDS-ACTION");
  const base = `/bands/${bandId}/practices/${sid}/occurrences`;
  const put = await ben.api.put(`${base}/${keyOf(occurrence(start, 0))}/rsvp`, {
    data: { status: "going", scope: "all" },
  });
  expect(put.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const sent = await testApi.calendarInvitesFor(undefined, true);
  expect(sent.map((m) => m.to)).toEqual([BEN]);
  const text = unfold(sent[0]!.ics);
  expect(sent[0]!.method).toBe("REQUEST");
  expect(text).toContain("SEQUENCE:1");
  expect(text).toMatch(/PARTSTAT=ACCEPTED[^:]*:mailto:/);

  // A different answer for one occurrence adds a RECURRENCE-ID component.
  const one = await ben.api.put(`${base}/${keyOf(occurrence(start, 2))}/rsvp`, {
    data: { status: "not_going", scope: "this" },
  });
  expect(one.ok()).toBe(true);
  await testApi.calendarInvitesFlush(bandId);
  const second = await testApi.calendarInvitesFor(BEN, true);
  expect(second).toHaveLength(1);
  expect(unfold(second[0]!.ics)).toMatch(/RECURRENCE-ID:\d{8}T\d{6}Z/);
  expect(unfold(second[0]!.ics)).toContain("PARTSTAT=DECLINED");

  // Restating the same answer leaves the hash unchanged: nothing is sent.
  await ben.api.put(`${base}/${keyOf(occurrence(start, 2))}/rsvp`, {
    data: { status: "not_going", scope: "this" },
  });
  await testApi.calendarInvitesFlush(bandId);
  expect(await testApi.calendarInvitesFor()).toHaveLength(0);
  expect(await rsvpOf(ben, 2)).toBe("not_going");
});

test("one-click RSVP links in the invite body record the answer", async ({
  testApi,
}) => {
  const { ben, rsvpOf, benInvite } = await setup(testApi);
  const link = /Maybe: (\S+)/.exec(benInvite.text)![1]!;
  expect(link).toContain("/public/rsvp/");
  expect(benInvite.html).toContain("/public/rsvp/");

  const anon = await pwRequest.newContext();
  try {
    const res = await anon.get(link);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(await res.text()).toContain("maybe");
    expect(await rsvpOf(ben, 0)).toBe("maybe");
    expect(await rsvpOf(ben, 3)).toBe("maybe");

    const no = await anon.get(link.replace("response=maybe", "response=no"));
    expect(no.status()).toBe(200);
    expect(await rsvpOf(ben, 0)).toBe("not_going");

    const bad = await anon.get(
      link.replace("response=maybe", "response=bogus"),
    );
    expect(bad.status()).toBe(400);
    const forged = await anon.get(
      link.slice(0, -"?response=maybe".length - 3) + "xyz?response=going",
    );
    expect(forged.status()).toBe(400);
    expect(await rsvpOf(ben, 0)).toBe("not_going");
  } finally {
    await anon.dispose();
  }
});
