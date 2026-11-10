import { request as pwRequest } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import {
  BEN,
  createGig,
  createPractice,
  keyOf,
  newBand,
  nextTuesday,
  occurrence,
} from "./calendar-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const unfold = (s: string): string => s.replace(/\r\n[ \t]/g, "");

test("the member feed lists the band's events with that member's RSVP, and rotation revokes the old URL", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  const ben = await join(BEN);
  const start = nextTuesday(7);
  const series = await createPractice(ava.api, bandId, start, {
    title: "Weekly practice",
  });
  const gig = await createGig(ava.api, bandId, { title: "Club Meridian" });
  const put = await ben.api.put(
    `/bands/${bandId}/practices/${series.id}/occurrences/${keyOf(occurrence(start, 0))}/rsvp`,
    { data: { status: "going", scope: "all" } },
  );
  expect(put.ok()).toBe(true);

  const link = await (
    await ben.api.get(`/bands/${bandId}/calendar-feed`)
  ).json();
  expect(link.url).toMatch(/\/public\/calendar-feed\/[0-9a-f]{64}\.ics$/);
  expect(link.webcalUrl).toMatch(/^webcal:/);
  // The link is stable between reads.
  expect(
    (await (await ben.api.get(`/bands/${bandId}/calendar-feed`)).json()).url,
  ).toBe(link.url);

  const anon = await pwRequest.newContext({
    extraHTTPHeaders: { "x-test-ip": "feed-1" },
  });
  try {
    const res = await anon.get(link.url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    expect(res.headers()["cache-control"]).toContain("max-age");
    const text = unfold(await res.text());
    expect(text).toContain("METHOD:PUBLISH");
    expect(text).toContain(`UID:series-${series.id}@`);
    expect(text).toContain(`UID:gig-${gig.id}@`);
    expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    expect(text).toMatch(new RegExp(`PARTSTAT=ACCEPTED[^:]*:mailto:${BEN}`));
    expect(text).toContain("SUMMARY:Club Meridian");

    // Conditional requests revalidate with the ETag.
    const etag = res.headers()["etag"]!;
    const again = await anon.get(link.url, {
      headers: { "if-none-match": etag },
    });
    expect(again.status()).toBe(304);

    // Other members see their own RSVP state in their own feed.
    const avaLink = await (
      await ava.api.get(`/bands/${bandId}/calendar-feed`)
    ).json();
    expect(avaLink.url).not.toBe(link.url);
    const avaText = unfold(await (await anon.get(avaLink.url)).text());
    expect(avaText).not.toContain("PARTSTAT=ACCEPTED");

    const rotated = await (
      await ben.api.post(`/bands/${bandId}/calendar-feed/rotate`)
    ).json();
    expect(rotated.url).not.toBe(link.url);
    expect((await anon.get(link.url)).status()).toBe(404);
    expect((await anon.get(rotated.url)).status()).toBe(200);

    // Malformed or unknown tokens are 404s.
    const base = link.url.slice(0, link.url.lastIndexOf("/") + 1);
    expect((await anon.get(`${base}nope.ics`)).status()).toBe(404);
    expect((await anon.get(`${base}${"a".repeat(64)}.ics`)).status()).toBe(404);
  } finally {
    await anon.dispose();
  }
});

test("a member who left no longer resolves, and the endpoint is throttled", async ({
  testApi,
}) => {
  const { ava, bandId, join } = await newBand(testApi);
  const ben = await join(BEN);
  const link = await (
    await ben.api.get(`/bands/${bandId}/calendar-feed`)
  ).json();
  const leave = await ben.api.post(`/bands/${bandId}/leave`, { data: {} });
  expect(leave.ok(), await leave.text()).toBe(true);
  const anon = await pwRequest.newContext({
    extraHTTPHeaders: { "x-test-ip": "feed-2" },
  });
  try {
    expect((await anon.get(link.url)).status()).toBe(404);
    let limited = false;
    for (let i = 0; i < 80 && !limited; i++) {
      limited = (await anon.get(link.url)).status() === 429;
    }
    expect(limited).toBe(true);
  } finally {
    await anon.dispose();
  }
  void ava;
});
