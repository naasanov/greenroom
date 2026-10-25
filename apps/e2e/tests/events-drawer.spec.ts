import type { BandSeedResult } from "@greenroom/db";
import { practiceSeries, type Database } from "@greenroom/db";
import { request as pwRequest, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import {
  AVA,
  calendar,
  eventIn,
  isoDay,
  showGigDate,
} from "./events-helpers.js";

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
  // Club Meridian's drawer is tall (seeded setlist), so it is opened second.
  const a = seed.gigs.hidden;
  const b = seed.gigs.upcomingClub;
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

const scopeDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Edit recurring event" });

async function openMovedPracticeEdit(page: Page) {
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  const drawer = dialog(page, seed.practice.title);
  await drawer.getByRole("button", { name: "Edit" }).click();
  await expect(drawer.getByLabel("Title")).toHaveValue(seed.practice.title);
  return drawer;
}

const seriesRow = async (db: Database) =>
  (
    await db
      .select()
      .from(practiceSeries)
      .where(eq(practiceSeries.id, seed.practice.seriesId))
  )[0];

test("editing a recurring practice opens the form without asking the scope", async ({
  page,
}) => {
  const drawer = await openMovedPracticeEdit(page);
  await expect(scopeDialog(page)).toHaveCount(0);
  await expect(drawer.getByLabel("Start time")).toHaveValue("19:00");
  await expect(drawer.getByLabel("End time")).toHaveValue("21:00");
  await expect(drawer.getByLabel("Duration")).toHaveCount(0);
  await expect(drawer.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekly",
  );
});

test("saving a recurring practice asks the scope; This event leaves the series alone", async ({
  page,
}) => {
  const drawer = await openMovedPracticeEdit(page);
  await drawer.getByLabel("Title").fill("Special rehearsal");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await scopeDialog(page).getByRole("button", { name: "OK" }).click();
  await expect(dialog(page, "Special rehearsal")).toBeVisible();
  await dialog(page, "Special rehearsal")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(eventIn(page, "Special rehearsal")).toHaveCount(1);
  await expect(eventIn(page, seed.practice.title).first()).toBeVisible();
});

test("cancelling the scope dialog keeps the edits in the form", async ({
  page,
}) => {
  const drawer = await openMovedPracticeEdit(page);
  await drawer.getByLabel("Title").fill("Unsaved title");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await scopeDialog(page).getByRole("button", { name: "Back" }).click();
  await expect(scopeDialog(page)).toHaveCount(0);
  await expect(drawer.getByLabel("Title")).toHaveValue("Unsaved title");
});

test("changing the recurrence hides the 'This event' scope", async ({
  page,
}) => {
  const drawer = await openMovedPracticeEdit(page);
  await drawer.getByLabel("Repeat", { exact: true }).selectOption("monthly");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  const scope = scopeDialog(page);
  await expect(scope).toBeVisible();
  await expect(scope.getByLabel("This event")).toHaveCount(0);
  await expect(scope.getByLabel("This and following events")).toBeVisible();
  await expect(scope.getByLabel("All events")).toBeVisible();
});

test("'All events' with an untouched date keeps the series start", async ({
  page,
  db,
}) => {
  // The seeded rrule lacks the RRULE: prefix the update path parses.
  await db
    .update(practiceSeries)
    .set({ rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU" })
    .where(eq(practiceSeries.id, seed.practice.seriesId));
  const before = await seriesRow(db);
  const drawer = await openMovedPracticeEdit(page);
  await drawer.getByLabel("Title").fill("Renamed practice");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await scopeDialog(page).getByLabel("All events").click();
  await scopeDialog(page).getByRole("button", { name: "OK" }).click();
  await expect
    .poll(async () => (await seriesRow(db)).title)
    .toBe("Renamed practice");
  const after = await seriesRow(db);
  expect(after.dtstart.toISOString()).toBe(before.dtstart.toISOString());
});

test("an end time before the start runs past midnight", async ({ page }) => {
  const drawer = await openMovedPracticeEdit(page);
  await drawer.getByLabel("Start time").fill("22:00");
  await expect(drawer.getByLabel("End time")).toHaveValue("00:00");
  await drawer.getByLabel("End time").fill("01:00");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await scopeDialog(page).getByRole("button", { name: "OK" }).click();
  await expect(dialog(page, seed.practice.title)).toContainText(
    "10:00 PM - 1:00 AM",
  );
});

test("a one-off practice saves without a scope dialog", async ({
  page,
  testApi,
}) => {
  const { cookie } = await testApi.login(AVA);
  const api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  const date = isoDay(3);
  const res = await api.post(`/bands/${seed.bands.nightOwls.id}/practices`, {
    data: {
      title: "One-off jam",
      startDate: date,
      startTime: "18:00",
      durationMinutes: 90,
      timeZone: "UTC",
    },
  });
  expect(res.status()).toBe(201);
  const series = await res.json();
  await page.goto(`/practices/${series.id}?date=${date}`);
  const drawer = dialog(page, "One-off jam");
  await drawer.getByRole("button", { name: "Edit" }).click();
  await expect(drawer.getByLabel("End time")).toHaveValue("19:30");
  await drawer.getByLabel("Title").fill("One-off jam v2");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(scopeDialog(page)).toHaveCount(0);
  await expect(dialog(page, "One-off jam v2")).toBeVisible();
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
