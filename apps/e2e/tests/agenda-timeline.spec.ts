import {
  BANDS,
  gigs,
  practiceSeries,
  type BandSeedResult,
} from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import {
  agendaCard,
  agendaScroller,
  agendaSheet,
  cardDate,
  openAgenda,
} from "./agenda-helpers.js";
import { AVA, isoDay } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

test("agenda button sits above the add button and opens a right sheet", async ({
  page,
}) => {
  await page.goto("/events");
  const agenda = page.getByRole("button", { name: "Agenda" });
  const add = page.getByRole("button", { name: "Add event" });
  const a = (await agenda.boundingBox())!;
  const b = (await add.boundingBox())!;
  expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  expect(a.width).toBeLessThan(b.width);
  await agenda.click();
  const sheet = agendaSheet(page);
  await expect(sheet).toBeVisible();
  const viewport = page.viewportSize()!;
  // The sheet slides in from the right; wait for it to land on the edge.
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return Math.round(box.x + box.width);
    })
    .toBe(viewport.width);
  const box = (await sheet.boundingBox())!;
  if (viewport.width < 768) expect(box.width).toBeCloseTo(viewport.width, 0);
});

test("opens at the today line with the latest past card peeking above", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  const sheet = agendaSheet(page);
  const scroller = (await agendaScroller(page).boundingBox())!;
  const today = (await sheet.getByTestId("agenda-today").boundingBox())!;
  expect(today.y).toBeGreaterThanOrEqual(scroller.y);
  expect(today.y + today.height).toBeLessThanOrEqual(
    scroller.y + scroller.height,
  );

  // The nearest past card is cut by the sticky filter row, so only part shows.
  const filterRow = (await sheet.getByTestId("agenda-filter").boundingBox())!;
  const filterBottom = filterRow.y + filterRow.height;
  const past = sheet.locator('[data-agenda-card="past"]');
  const peek = (await past.last().boundingBox())!;
  expect(peek.y).toBeLessThan(filterBottom);
  expect(peek.y + peek.height).toBeGreaterThan(filterBottom + 8);
  expect(peek.y + peek.height).toBeLessThanOrEqual(today.y);

  // Upcoming cards run soonest to latest below the line.
  const upcoming = sheet.locator('[data-agenda-card="upcoming"]');
  expect(await upcoming.count()).toBeGreaterThan(2);
  const ys = await upcoming.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().top),
  );
  expect(ys).toEqual([...ys].sort((x, y) => x - y));
  expect(ys[0]).toBeGreaterThan(today.y);
});

test("cards show title, date, time, type, and the venue name for gigs", async ({
  page,
}) => {
  const club = seed.gigs.upcomingClub;
  const tentative = seed.gigs.tentative;
  await page.goto("/events");
  await openAgenda(page);

  const gig = agendaCard(page, club.title);
  await gig.scrollIntoViewIfNeeded();
  await expect(gig.getByTestId("agenda-date")).toHaveText(cardDate(club.date));
  await expect(gig.getByTestId("agenda-time")).toContainText("8:00");
  await expect(gig.getByTestId("agenda-type")).toHaveText("Gig");
  await expect(gig.getByTestId("agenda-venue")).toHaveText("Club Meridian");
  await expect(gig).not.toContainText("88 Main St");

  const untimed = agendaCard(page, tentative.title);
  await untimed.scrollIntoViewIfNeeded();
  await expect(untimed.getByTestId("agenda-time")).toHaveCount(0);
  await expect(untimed.getByTestId("agenda-venue")).toHaveText(
    "Hopworks Brewery",
  );

  const practice = agendaSheet(page)
    .locator('[data-agenda-card="upcoming"][data-event-type="practice"]')
    .first();
  await practice.scrollIntoViewIfNeeded();
  await expect(practice.getByTestId("agenda-type")).toHaveText("Practice");
  await expect(practice).toContainText(seed.practice.title);
  await expect(practice.getByTestId("agenda-time")).toContainText("PM");
  await expect(practice.getByTestId("agenda-venue")).toHaveCount(0);
});

test("the gig and practice filter narrows the list and is remembered", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  const sheet = agendaSheet(page);
  const gigsOnly = sheet.getByRole("radio", { name: "Gigs" });
  await gigsOnly.click();
  await expect(sheet.locator('[data-event-type="gig"]').first()).toBeAttached();
  await expect(sheet.locator('[data-event-type="practice"]')).toHaveCount(0);

  await sheet.getByRole("radio", { name: "Practices" }).click();
  await expect(
    sheet.locator('[data-event-type="practice"]').first(),
  ).toBeAttached();
  await expect(sheet.locator('[data-event-type="gig"]')).toHaveCount(0);

  await page.reload();
  await openAgenda(page);
  await expect(
    agendaSheet(page).getByRole("radio", { name: "Practices" }),
  ).toBeChecked();
  await expect(
    agendaSheet(page).locator('[data-event-type="gig"]'),
  ).toHaveCount(0);
  // The calendar itself stays unfiltered.
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("calendar")).toBeVisible();
});

test("scrolling up reveals older past events", async ({ page }) => {
  const old = seed.gigs.pastFestival;
  await page.goto("/events");
  await openAgenda(page);
  const card = agendaCard(page, old.title);
  const scroller = agendaScroller(page);
  const before = (await card.boundingBox())!;
  const view = (await scroller.boundingBox())!;
  expect(before.y + before.height).toBeLessThan(view.y);

  await scroller.evaluate((el) => (el.scrollTop = 0));
  await expect(card).toBeInViewport();
  await expect(agendaSheet(page).getByText("No earlier events")).toBeVisible();
});

test("the window extends back for older events and keeps the scroll position", async ({
  page,
  db,
}) => {
  const date = isoDay(-200);
  await db.insert(gigs).values({
    bandId: BANDS.nightOwls.id,
    title: "Long Ago Show",
    date,
    timeZone: "UTC",
    startsAt: new Date(`${date}T20:00:00Z`),
    endsAt: new Date(`${date}T22:00:00Z`),
    createdByUserId: seed.users.ava.id,
  });
  await page.goto("/events");
  await openAgenda(page);
  const sheet = agendaSheet(page);
  const scroller = agendaScroller(page);

  // Read the anchor's position in the same tick as the jump, before any fetch lands.
  const anchorTitle = seed.gigs.pastFestival.title;
  const anchor = agendaCard(page, anchorTitle);
  const before = await scroller.evaluate((el, title) => {
    el.scrollTop = 0;
    const card = [...el.querySelectorAll('[data-testid="agenda-card"]')].find(
      (c) => c.textContent?.includes(title),
    )!;
    return card.getBoundingClientRect().top;
  }, anchorTitle);
  await expect(agendaCard(page, "Long Ago Show")).toBeAttached();
  await expect(sheet.getByText("No earlier events")).toBeVisible();
  const after = (await anchor.boundingBox())!;
  expect(Math.abs(after.y - before)).toBeLessThan(3);

  await scroller.evaluate((el) => (el.scrollTop = 0));
  await expect(agendaCard(page, "Long Ago Show")).toBeInViewport();
});

test("shows an empty state when the band has no events", async ({
  page,
  db,
}) => {
  await db.delete(gigs);
  await db.delete(practiceSeries);
  await page.goto("/events");
  await page.getByRole("button", { name: "Agenda" }).click();
  await expect(agendaSheet(page).getByText("No events yet")).toBeVisible();
  await expect(agendaSheet(page).getByTestId("agenda-card")).toHaveCount(0);
});
