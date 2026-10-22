import type { BandSeedResult } from "@greenroom/db";
import type { Page } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { AVA, calendar, eventIn, showGigDate } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
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

/** A drawer by its title; `exiting` ones are mid-slide-down. */
const drawer = (page: Page, title: string) =>
  page.locator("[data-vaul-drawer]", { hasText: title });
const exiting = (page: Page, title: string) =>
  page.locator("[data-vaul-drawer][data-exiting]", { hasText: title });
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
  await eventIn(page, b.title).click();

  // Both drawers exist at once: A closing, B open.
  await expect(exiting(page, a.title)).toHaveAttribute("data-state", "closed");
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
  await calendar(page)
    .locator(".fc-event", { hasText: practiceTitle })
    .first()
    .click();
  await expect(exiting(page, gig.title)).toHaveCount(1);
  await expect(live(page, practiceTitle)).toBeVisible();
  await expect(page).toHaveURL(/\/practices\/[^/?]+\?date=/);
  await expect(drawer(page, gig.title)).toHaveCount(0);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
});

test("rapid taps across three gigs end on the last one with no stuck drawers", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  const b = seed.gigs.hidden;
  const c = seed.gigs.tentative;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  await tap(eventIn(page, b.title));
  await tap(eventIn(page, c.title));
  await expect(page).toHaveURL(new RegExp(`/gigs/${c.id}$`));
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
  await expect(live(page, c.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/gigs/${c.id}$`));
});

test("tapping a day while a gig is open hands off to the create drawer", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  await calendar(page)
    .locator("td.fc-daygrid-day")
    .first()
    .click({ position: { x: 8, y: 50 } });
  await expect(exiting(page, a.title)).toHaveCount(1);
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
  await expect(exiting(page, "New event")).toHaveCount(1);
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
  await expect(exiting(page, a.title)).toHaveAttribute("data-state", "closed");
  await expect(drawer(page, a.title)).toHaveCount(0);
});
