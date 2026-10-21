import type { BandSeedResult } from "@greenroom/db";
import { WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { AVA, calendar, eventIn, showGigDate } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const dialog = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("dialog", { name });

test("opening an event updates the URL without remounting the calendar", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);
  await page.evaluate(() => {
    (
      document.querySelector('[data-testid="calendar"]') as HTMLElement & {
        __mark?: number;
      }
    ).__mark = 1;
  });
  await eventIn(page, gig.title).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gig.id}$`));
  const drawer = dialog(page, gig.title);
  await expect(drawer).toContainText("8:00 PM");
  await expect(drawer).toContainText("88 Main St");
  await expect(drawer).toContainText("Pat Promoter");
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/events$/);
  const mark = await page.evaluate(
    () =>
      (
        document.querySelector('[data-testid="calendar"]') as HTMLElement & {
          __mark?: number;
        }
      ).__mark,
  );
  expect(mark).toBe(1);
});

test("gig deep link opens the calendar at the gig's date", async ({ page }) => {
  const gig = seed.gigs.tentative;
  await page.goto(`/gigs/${gig.id}`);
  await expect(dialog(page, gig.title)).toBeVisible();
  await expect(page.getByTestId("events-tab")).toHaveAttribute(
    "data-focus-date",
    gig.date,
  );
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${gig.date}T12:00:00Z`));
  await expect(page.getByTestId("calendar-title")).toContainText(month);
});

test("tapping another event while one is open switches to it", async ({
  page,
}) => {
  const a = seed.gigs.upcomingClub;
  const b = seed.gigs.hidden;
  await showGigDate(page, a.id, a.title);
  await eventIn(page, a.title).click();
  await expect(dialog(page, a.title)).toBeVisible();
  await eventIn(page, b.title).click();
  await expect(dialog(page, b.title)).toBeVisible();
  await expect(dialog(page, a.title)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/gigs/${b.id}$`));
});

test("edit a gig", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  const drawer = dialog(page, gig.title);
  await drawer.getByRole("button", { name: "Edit" }).click();
  const title = drawer.getByLabel("Title");
  await expect(title).toHaveValue(gig.title);
  await title.fill("Club Meridian (late set)");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog(page, "Club Meridian (late set)")).toBeVisible();
  await expect(eventIn(page, "Club Meridian (late set)")).toBeVisible();
});

test("dirty edit asks before closing", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  const drawer = dialog(page, gig.title);
  await drawer.getByRole("button", { name: "Edit" }).click();
  await drawer.getByLabel("Title").fill("Changed");
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Discard changes?");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("deleting a gig warns that media stays in Drive", async ({ page }) => {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  await dialog(page, gig.title).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("remain in Google Drive");
  await confirm.getByRole("button", { name: "Delete gig" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(eventIn(page, gig.title)).toHaveCount(0);
});

test("practice occurrence shows attendees and saves an RSVP", async ({
  page,
}) => {
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  const drawer = dialog(page, seed.practice.title);
  await expect(drawer.getByTestId("attendee-list")).toBeVisible();
  await drawer.getByRole("radio", { name: "Going", exact: true }).click();
  await expect(
    drawer.getByRole("radio", { name: "Going", exact: true }),
  ).toBeChecked();
  await expect(
    drawer.locator('[data-testid="attendee-list"] li[data-status="going"]'),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    dialog(page, seed.practice.title).getByRole("radio", {
      name: "Going",
      exact: true,
    }),
  ).toBeChecked();
});

test("editing one occurrence with scope 'This event' leaves the series alone", async ({
  page,
}) => {
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  const drawer = dialog(page, seed.practice.title);
  await drawer.getByRole("button", { name: "Edit" }).click();
  const scope = page.getByRole("dialog", { name: "Edit recurring event" });
  await expect(scope).toBeVisible();
  await scope.getByRole("button", { name: "OK" }).click();
  await expect(drawer.getByLabel("Repeat", { exact: true })).toHaveCount(0);
  await drawer.getByLabel("Title").fill("Special rehearsal");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog(page, "Special rehearsal")).toBeVisible();
  await dialog(page, "Special rehearsal")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(eventIn(page, "Special rehearsal")).toHaveCount(1);
  await expect(eventIn(page, seed.practice.title).first()).toBeVisible();
});

test("deleting a recurring practice asks for a scope", async ({ page }) => {
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  await dialog(page, seed.practice.title)
    .getByRole("button", { name: "Delete" })
    .click();
  const scope = page.getByRole("dialog", { name: "Cancel recurring event" });
  await expect(scope).toBeVisible();
  await expect(scope.getByLabel("All events")).toBeVisible();
  await expect(calendar(page)).toBeVisible();
});

test("share button copies the canonical practice link", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    !!isMobile || browserName !== "chromium",
    "clipboard reads are only granted on desktop Chromium",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: WEB_URL,
  });
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  await dialog(page, seed.practice.title)
    .getByRole("button", { name: "Share link" })
    .click();
  await expect(page.getByText("Link copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${WEB_URL}/practices/${seed.practice.seriesId}?date=${date}`,
  );
});
