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

/** Picks "Gig" or "Practice" in the open create drawer and returns that form's pane. */
export async function pickSide(page: Page, side: "gig" | "practice") {
  await page
    .getByTestId(side === "gig" ? "split-pick-right" : "split-pick-left")
    .click();
  return page.getByTestId(side === "gig" ? "split-right" : "split-left");
}
