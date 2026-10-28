import type { BandSeedResult } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { agendaCard, agendaSheet, openAgenda } from "./agenda-helpers.js";
import { AVA, calendar } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const live = (page: import("@playwright/test").Page, title: string) =>
  page.locator("[data-vaul-drawer]:not([data-exiting])", { hasText: title });

const isWide = (page: import("@playwright/test").Page) =>
  page.viewportSize()!.width >= 768;

test("desktop event drawer sits left of the floating buttons", async ({
  page,
}) => {
  test.skip(!isWide(page), "desktop layout");
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  const drawer = live(page, gig.title);
  await expect(drawer).toBeVisible();
  const fab = page.getByRole("button", { name: "Add event" });
  await expect
    .poll(async () => {
      const d = (await drawer.boundingBox())!;
      const f = (await fab.boundingBox())!;
      return d.y < page.viewportSize()!.height && d.x + d.width <= f.x;
    })
    .toBe(true);
  const d = (await drawer.boundingBox())!;
  const f = (await fab.boundingBox())!;
  expect(f.x - (d.x + d.width)).toBeLessThan(40);
  expect(d.x + d.width).toBeGreaterThan(page.viewportSize()!.width / 2);
});

test("desktop event drawer follows the FAB column beside the agenda sheet", async ({
  page,
}) => {
  test.skip(!isWide(page), "desktop layout");
  const gig = seed.gigs.upcomingClub;
  await page.goto("/events");
  await openAgenda(page);
  const card = agendaCard(page, gig.title);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const drawer = live(page, gig.title);
  await expect(drawer).toBeVisible();
  await expect
    .poll(async () => {
      const sheet = (await agendaSheet(page).boundingBox())!;
      const d = (await drawer.boundingBox())!;
      const fab = (await page
        .getByRole("button", { name: "Add event" })
        .boundingBox())!;
      return (
        Math.round(sheet.x - fab.x - fab.width) > 0 &&
        Math.round(fab.x - (d.x + d.width))
      );
    })
    .toBe(16);
});

test("desktop agenda is open by default and leaves the FAB clickable", async ({
  page,
}) => {
  test.skip(!isWide(page), "desktop layout");
  await page.goto("/events");
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "open");
  const fab = page.getByRole("button", { name: "Add event" });
  await expect
    .poll(async () => {
      const sheet = (await agendaSheet(page).boundingBox())!;
      const f = (await fab.boundingBox())!;
      return f.x + f.width <= sheet.x;
    })
    .toBe(true);
  await fab.click();
  await expect(page.getByTestId("split-viewport")).toBeVisible();
});

test("closing the agenda on desktop keeps it closed", async ({ page }) => {
  test.skip(!isWide(page), "desktop layout");
  await page.goto("/events");
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "open");
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "closed");
  await expect(page.getByRole("button", { name: "Agenda" })).toBeVisible();
});

test("desktop agenda pushes the calendar instead of covering it", async ({
  page,
}) => {
  test.skip(!isWide(page), "desktop layout");
  await page.goto("/events");
  await expect(calendar(page)).toBeVisible();
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "closed");
  await page.waitForTimeout(400);
  const full = (await calendar(page).boundingBox())!;
  await page.getByRole("button", { name: "Agenda" }).click();
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "open");
  await expect
    .poll(async () => {
      const cal = (await calendar(page).boundingBox())!;
      const sheet = (await agendaSheet(page).boundingBox())!;
      return cal.x + cal.width <= sheet.x + 0.5;
    })
    .toBe(true);
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect
    .poll(async () => {
      const cal = (await calendar(page).boundingBox())!;
      return Math.abs(cal.width - full.width) < 1;
    })
    .toBe(true);
});

test("drawer title is centered and the footer clears the bottom edge", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  const drawer = live(page, gig.title);
  await expect(drawer).toBeVisible();
  const title = drawer.locator("[data-slot=drawer-title]");
  await expect(title).toBeVisible();
  await expect
    .poll(async () => {
      const t = (await title.boundingBox())!;
      const d = (await drawer.boundingBox())!;
      return Math.abs(t.x + t.width / 2 - (d.x + d.width / 2));
    })
    .toBeLessThan(1.5);
  const textBox = await title.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { x: b.x, w: b.width };
  });
  const d = (await drawer.boundingBox())!;
  expect(
    Math.abs(textBox.x + textBox.w / 2 - (d.x + d.width / 2)),
  ).toBeLessThan(1.5);

  const edit = drawer.getByRole("button", { name: "Edit" });
  await expect
    .poll(async () => {
      const dr = (await drawer.boundingBox())!;
      return Math.round(dr.y + dr.height);
    })
    .toBeLessThanOrEqual(page.viewportSize()!.height);
  const e = (await edit.boundingBox())!;
  const dr = (await drawer.boundingBox())!;
  expect(dr.y + dr.height - (e.y + e.height)).toBeGreaterThanOrEqual(12);
  expect(page.viewportSize()!.height - (dr.y + dr.height)).toBeLessThan(1);
});

test("tapping an agenda card brings its month into view, even on a repeat tap", async ({
  page,
}) => {
  test.skip(!isWide(page), "the phone sheet covers the calendar");
  const gig = seed.gigs.upcomingClub;
  await page.goto("/events");
  await openAgenda(page);
  const title = page.getByTestId("calendar-title");
  const next = calendar(page).getByRole("button", { name: "Next" });
  const card = agendaCard(page, gig.title);
  await card.scrollIntoViewIfNeeded();
  await next.click();
  await next.click();
  await next.click();
  const away = await title.textContent();
  await card.click();
  await expect(title).not.toHaveText(away!);
  const home = await title.textContent();
  await next.click();
  await expect(title).not.toHaveText(home!);
  await card.click();
  await expect(title).toHaveText(home!);
});
