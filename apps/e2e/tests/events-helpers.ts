import { USERS } from "@greenroom/db";
import type { Locator, Page } from "@playwright/test";
import { expect } from "../src/fixtures.js";

/** `YYYY-MM-DD` of today plus `days`, in UTC (matches the seed's UTC gigs). */
export function isoDay(days = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const AVA = USERS.ava.email;

/** The SideDrawer container (phone dialog or wide aside) holding `inner`. */
export const sideDrawerOf = (inner: Locator): Locator =>
  inner.locator("xpath=ancestor::*[@role='dialog' or self::aside][1]");

/**
 * Closes a SideDrawer within `scope`: phone drawers (under 768px) have a "Close"
 * chevron, the wide side panel has a "Done" text button.
 */
export async function closeSideDrawer(scope: Locator) {
  const width = scope.page().viewportSize()?.width ?? 1280;
  const name = width < 768 ? "Close" : "Done";
  await scope.getByRole("button", { name, exact: true }).click();
}

export const calendar = (page: Page) => page.getByTestId("calendar");

/** A calendar event chip or block by its title. */
export const eventIn = (page: Page, title: string): Locator =>
  calendar(page).locator(".fc-event", { hasText: title });

/** Opens a gig deep link, waits for the drawer, and closes it, leaving the calendar on its date. */
export async function showGigDate(page: Page, gigId: string, title: string) {
  await page.goto(`/gigs/${gigId}`);
  const drawer = page.getByRole("dialog", { name: title });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(drawer).toBeHidden();
}

/**
 * Switches to Week view and pages with Next/Previous until the week holding
 * `date` (`YYYY-MM-DD`) is shown, since Week anchors on today when it shares the month.
 */
export async function showWeekOf(page: Page, date: string) {
  await page.getByRole("radio", { name: "Week" }).click();
  await expect(calendar(page)).toHaveAttribute("data-view", "week");
  const header = calendar(page).locator(
    `[data-grid] .fc-col-header-cell[data-date="${date}"]`,
  );
  const first = calendar(page)
    .locator("[data-grid] .fc-col-header-cell")
    .first();
  for (let i = 0; i < 20 && (await header.count()) === 0; i++) {
    const start = (await first.getAttribute("data-date")) ?? date;
    await page
      .getByRole("button", { name: date > start ? "Next" : "Previous" })
      .click();
    await expect(first).not.toHaveAttribute("data-date", start);
  }
  await expect(header).toBeVisible();
}

/** Picks "Gig" or "Practice" in the open create drawer and returns that form's pane. */
export async function pickSide(page: Page, side: "gig" | "practice") {
  await page
    .getByTestId(side === "gig" ? "split-pick-right" : "split-pick-left")
    .click();
  return page.getByTestId(side === "gig" ? "split-right" : "split-left");
}
