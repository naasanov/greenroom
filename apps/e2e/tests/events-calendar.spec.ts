import type { BandSeedResult } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { AVA, calendar, eventIn, showGigDate } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

test("month is the default view and shows a today marker", async ({ page }) => {
  await page.goto("/events");
  await expect(calendar(page)).toHaveAttribute("data-view", "month");
  await expect(calendar(page).locator(".fc-daygrid-body")).toBeVisible();
  await expect(calendar(page).locator(".fc-day-today")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add event" })).toBeVisible();
});

test("month/week choice persists across reloads", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("radio", { name: "Week" }).click();
  await expect(calendar(page)).toHaveAttribute("data-view", "week");
  await expect(calendar(page).locator(".fc-timegrid")).toBeVisible();
  await page.reload();
  await expect(calendar(page)).toHaveAttribute("data-view", "week");
  await page.getByRole("radio", { name: "Month" }).click();
  await expect(calendar(page)).toHaveAttribute("data-view", "month");
});

test("Today jumps back after paging away", async ({ page }) => {
  await page.goto("/events");
  const title = page.getByTestId("calendar-title");
  const start = await title.textContent();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(title).not.toHaveText(start ?? "");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(title).toHaveText(start ?? "");
});

test("gigs and practices render as color-coded chips on their days", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);

  const gigChip = eventIn(page, gig.title);
  await expect(gigChip).toHaveClass(/gr-gig/);
  await expect(gigChip).toContainText("8p");
  const cell = calendar(page).locator(`td[data-date="${gig.date}"]`);
  await expect(cell.locator(".fc-event", { hasText: gig.title })).toBeVisible();

  await expect(eventIn(page, seed.practice.title).first()).toHaveClass(
    /gr-practice/,
  );
});

test("a gig with a date but no time sits in the all-day strip", async ({
  page,
}) => {
  const gig = seed.gigs.tentative;
  await showGigDate(page, gig.id, gig.title);
  await page.getByRole("radio", { name: "Week" }).click();
  const allDay = calendar(page).locator(".fc-timegrid .fc-daygrid-body");
  await expect(
    allDay.locator(".fc-event", { hasText: gig.title }),
  ).toBeVisible();
});

test("timed events appear in the week time grid", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);
  await page.getByRole("radio", { name: "Week" }).click();
  const block = calendar(page).locator(".fc-timegrid-event", {
    hasText: gig.title,
  });
  await expect(block).toBeVisible();
  await expect(block).toContainText("8:00 PM");
});

for (const view of ["Month", "Week"] as const) {
  test(`${view} view has no horizontal page scroll`, async ({ page }) => {
    await page.goto("/events");
    await page.getByRole("radio", { name: view }).click();
    await expect(calendar(page)).toHaveAttribute(
      "data-view",
      view.toLowerCase(),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
