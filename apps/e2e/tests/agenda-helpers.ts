import type { Locator, Page } from "@playwright/test";
import { expect } from "../src/fixtures.js";

/** The agenda sheet. */
export const agendaSheet = (page: Page) => page.getByTestId("right-sheet");

/** The sheet's scrolling body. */
export const agendaScroller = (page: Page) =>
  agendaSheet(page).getByTestId("right-sheet-body");

/** An agenda card by its title. */
export const agendaCard = (page: Page, title: string): Locator =>
  agendaSheet(page).getByTestId("agenda-card").filter({ hasText: title });

/** "Fri, Nov 6, 2026" for a `YYYY-MM-DD` date, matching the card's date label. */
export function cardDate(date: string): string {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const year = String(new Date().getFullYear());
  return date.startsWith(year) ? label.replace(`, ${year}`, "") : label;
}

/**
 * Opens the agenda (it is already open by default on desktop) and waits until
 * it has scrolled to the today line.
 */
export async function openAgenda(page: Page) {
  const button = page.getByRole("button", { name: "Agenda" });
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await button.click();
  } else if ((await agendaSheet(page).getAttribute("data-state")) !== "open") {
    // Closed by the user, or still hydrating (the button then vanishes as it auto-opens).
    await button.click({ timeout: 2000 }).catch(() => {});
  }
  await expect(agendaSheet(page)).toBeVisible();
  await expect(agendaSheet(page).getByTestId("agenda-today")).toBeVisible();
  // Positioning happens once the data lands; wait for the scroll to settle.
  await expect
    .poll(() => agendaScroller(page).evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
}
