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

test("the gig opened from a deep link is highlighted on the calendar", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByRole("dialog", { name: gig.title })).toBeVisible();
  const chip = calendar(page).locator(".fc-event.gr-selected", {
    hasText: gig.title,
  });
  await expect(chip).toBeVisible();
  await expect(chip.locator("[data-selected='true']")).toHaveCount(1);
  await expect(calendar(page).locator("[data-selected='true']")).toHaveCount(1);
});

test("a horizontal swipe pages the calendar and a vertical one does not", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "WebKit cannot construct synthetic touches",
  );
  await page.goto("/events");
  const title = page.getByTestId("calendar-title");
  const start = (await title.textContent()) ?? "";
  const swipe = (dx: number, dy: number) =>
    calendar(page)
      .locator(".fc-view-harness")
      .first()
      .evaluate(
        (el, d) => {
          const box = el.getBoundingClientRect();
          const x = box.left + box.width / 2;
          const y = box.top + 60;
          const touch = (px: number, py: number) =>
            new Touch({
              identifier: 1,
              target: el,
              clientX: px,
              clientY: py,
            });
          const fire = (type: string, t: Touch, list: Touch[]) =>
            el.dispatchEvent(
              new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: list,
                changedTouches: [t],
              }),
            );
          const a = touch(x, y);
          fire("touchstart", a, [a]);
          const b = touch(x + d.dx, y + d.dy);
          fire("touchend", b, []);
        },
        { dx, dy },
      );
  await swipe(-30, 0);
  await expect(title).toHaveText(start);
  await swipe(-120, 150);
  await expect(title).toHaveText(start);
  await swipe(-120, 10);
  await expect(title).not.toHaveText(start);
  const next = (await title.textContent()) ?? "";
  await swipe(120, 10);
  await expect(title).toHaveText(start);
  expect(next).not.toBe(start);
});

test("a month chip fills the width and most of the height of its day", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);
  const cell = calendar(page).locator(`td[data-date="${gig.date}"]`);
  const chips = cell.locator(".fc-event");
  const n = await chips.count();
  const c = (await cell.boundingBox())!;
  const boxes = await Promise.all(
    Array.from({ length: n }, (_, i) => chips.nth(i).boundingBox()),
  );
  const filled = boxes.reduce((sum, b) => sum + b!.height, 0);
  expect(filled).toBeGreaterThan(c.height * 0.5);
  expect(boxes[0]!.width).toBeGreaterThan(c.width - 12);
});

test("a month chip shows its time range under the title", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);
  const chip = calendar(page)
    .locator(`td[data-date="${gig.date}"] .fc-event`)
    .first();
  await expect(chip.getByTestId("chip-details")).toContainText("8:00 PM");
  const head = (await chip.locator(".gr-chip-head").boundingBox())!;
  const box = (await chip.boundingBox())!;
  const details = (await chip.getByTestId("chip-details").boundingBox())!;
  // The title row sits near the chip top (phone chips pad more) and the range below it.
  expect(head.y - box.y).toBeLessThan(16);
  expect(details.y).toBeGreaterThanOrEqual(head.y);
});
