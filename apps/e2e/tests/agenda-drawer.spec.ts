import type { BandSeedResult } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { agendaCard, agendaSheet, openAgenda } from "./agenda-helpers.js";
import { AVA } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const live = (page: import("@playwright/test").Page, title: string) =>
  page.locator("[data-vaul-drawer]:not([data-exiting])", { hasText: title });

test("tapping a card opens the event drawer and updates the URL", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto("/events");
  await openAgenda(page);
  const card = agendaCard(page, gig.title);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gig.id}$`));
  const drawer = live(page, gig.title);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("88 Main St");

  const wide = page.viewportSize()!.width >= 768;
  const sheetBox = (await agendaSheet(page).boundingBox())!;
  await expect(drawer).toHaveAttribute("data-state", "open");
  // Let the slide-up and the shift beside the sheet settle.
  await expect
    .poll(async () => {
      const box = (await drawer.boundingBox())!;
      return Math.round(box.y);
    })
    .toBeLessThan(page.viewportSize()!.height);
  const box = (await drawer.boundingBox())!;
  if (wide) {
    // Beside the sheet: the drawer ends where the sheet begins.
    await expect
      .poll(async () => {
        const b = (await drawer.boundingBox())!;
        return b.x + b.width <= sheetBox.x + 0.5;
      })
      .toBe(true);
    await expect(agendaSheet(page)).toBeVisible();
  } else {
    // Over the full-screen sheet.
    expect(box.x).toBeLessThan(sheetBox.x + sheetBox.width);
    expect(box.x + box.width).toBeGreaterThan(sheetBox.x);
  }
});

test("closing the drawer leaves the agenda open", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto("/events");
  await openAgenda(page);
  const card = agendaCard(page, gig.title);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const drawer = live(page, gig.title);
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(0);
  await expect(agendaSheet(page)).toBeVisible();
  await expect(agendaCard(page, gig.title)).toBeVisible();
});

test("tapping another card while a drawer is open hands off to it", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  const b = seed.gigs.hidden;
  await page.goto("/events");
  await openAgenda(page);
  await agendaCard(page, a.title).click();
  await expect(live(page, a.title)).toBeVisible();
  const second = agendaCard(page, b.title);
  await second.scrollIntoViewIfNeeded();
  await second.dispatchEvent("pointerdown", {
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
  });
  await second.dispatchEvent("click");
  // The exit window opens at the press, so check it before the slower URL update.
  await expect(
    page.locator("[data-vaul-drawer][data-exiting]", { hasText: a.title }),
  ).toHaveCount(1);
  await expect(live(page, b.title)).toBeVisible();
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`/gigs/${b.id}$`));
  await expect(agendaSheet(page)).toBeVisible();
});

test("tapping a practice card opens the occurrence drawer", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  const card = agendaSheet(page)
    .locator('[data-agenda-card="upcoming"][data-event-type="practice"]')
    .first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page).toHaveURL(/\/practices\/[^/?]+\?date=/);
  await expect(live(page, seed.practice.title)).toBeVisible();
});
