import type { BandSeedResult } from "@greenroom/db";
import type { Page } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { AVA, calendar, eventIn, showGigDate } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ page, testApi, loginAs }) => {
  // Records every drawer that enters its exit slide, so the short window cannot be missed by polling.
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __exited: Set<string> }).__exited = seen;
    const scan = () =>
      document
        .querySelectorAll("[data-vaul-drawer][data-exiting]")
        .forEach((el) => seen.add(el.textContent ?? ""));
    document.addEventListener("DOMContentLoaded", () =>
      new MutationObserver(scan).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      }),
    );
  });
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

/** Taps an element a drawer may be covering, as an outside pointerdown plus click. */
async function tap(target: Locator) {
  await target.dispatchEvent("pointerdown", {
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
  });
  await target.dispatchEvent("click");
}

/** Taps the first calendar day cell no drawer covers, with a real pointer or touch tap. */
async function tapUncoveredDay(page: Page, isMobile: boolean) {
  const point = await calendar(page)
    .locator("td.fc-daygrid-day")
    .evaluateAll((cells) => {
      for (const cell of cells) {
        const r = cell.getBoundingClientRect();
        const x = r.left + 8;
        const y = r.top + Math.min(50, r.height - 4);
        if (cell.contains(document.elementFromPoint(x, y))) return { x, y };
      }
      return null;
    });
  expect(point).not.toBeNull();
  if (isMobile) await page.touchscreen.tap(point!.x, point!.y);
  else await page.mouse.click(point!.x, point!.y);
}

/** A drawer by its title; `exiting` ones are mid-slide-down. */
const drawer = (page: Page, title: string) =>
  page.locator("[data-vaul-drawer]", { hasText: title });
/** Resolves once a drawer containing `title` has been seen sliding away. */
const sawExiting = (page: Page, title: string) =>
  expect
    .poll(() =>
      page.evaluate(
        (t) =>
          [...(window as unknown as { __exited: Set<string> }).__exited].some(
            (text) => text.includes(t),
          ),
        title,
      ),
    )
    .toBe(true);
const live = (page: Page, title: string) =>
  page.locator("[data-vaul-drawer]:not([data-exiting])", { hasText: title });

test("tapping another gig slides the first drawer down while the second slides up", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  const b = seed.gigs.hidden;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  await tap(eventIn(page, b.title));

  // Both drawers exist at once: A closing, B open.
  await sawExiting(page, a.title);
  await expect(live(page, b.title)).toHaveAttribute("data-state", "open");
  await expect(page).toHaveURL(new RegExp(`/gigs/${b.id}$`));

  // A is removed once it has slid away; B is the only drawer left.
  await expect(drawer(page, a.title)).toHaveCount(0);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
  await expect(live(page, b.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/gigs/${b.id}$`));
});

test("switching from a gig to a practice occurrence overlaps the two drawers", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  const practiceTitle = seed.practice.title;
  await showGigDate(page, gig.id, gig.title);
  await eventIn(page, gig.title).click();
  await expect(live(page, gig.title)).toBeVisible();
  await tap(
    calendar(page).locator(".fc-event", { hasText: practiceTitle }).first(),
  );
  await sawExiting(page, gig.title);
  await expect(live(page, practiceTitle)).toBeVisible();
  await expect(page).toHaveURL(/\/practices\/[^/?]+\?date=/);
  await expect(drawer(page, gig.title)).toHaveCount(0);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
});

test("rapid taps across three events end on the last one with no stuck drawers", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  const b = seed.gigs.hidden;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  await tap(eventIn(page, b.title));
  await tap(eventIn(page, seed.practice.title).first());
  await expect(page).toHaveURL(/\/practices\/[^/?]+\?date=/);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
  await expect(live(page, seed.practice.title)).toBeVisible();
  await expect(page).toHaveURL(/\/practices\/[^/?]+\?date=/);
});

test("tapping a day while a gig is open hands off to the create drawer", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The gig drawer covers the whole calendar on phones");
  const a = seed.gigs.upcomingClub;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  await tapUncoveredDay(page, isMobile);
  await sawExiting(page, a.title);
  await expect(live(page, "New event")).toBeVisible();
  await expect(page).toHaveURL(/\/events$/);
  await expect(drawer(page, a.title)).toHaveCount(0);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
});

test("tapping a gig while the untouched create drawer is open hands off to the gig", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  await showGigDate(page, a.id, a.title);
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(live(page, "New event")).toBeVisible();
  await tap(eventIn(page, a.title));
  await sawExiting(page, "New event");
  await expect(live(page, a.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/gigs/${a.id}$`));
  await expect(drawer(page, "New event")).toHaveCount(0);
});

test("closing with the X slides the drawer down before removing it", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  const open = live(page, a.title);
  await expect(open).toBeVisible();
  await open.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await sawExiting(page, a.title);
  await expect(drawer(page, a.title)).toHaveCount(0);
});
