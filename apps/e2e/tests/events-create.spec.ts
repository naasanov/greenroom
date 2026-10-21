import type { BandSeedResult } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { AVA, calendar, eventIn, isoDay, pickSide } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

test("FAB creates a gig with just a title and date", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "gig");
  await pane.getByLabel("Title").fill("Quick gig");
  await pane.getByLabel("Date", { exact: true }).fill(isoDay(2));
  await pane.getByRole("button", { name: "Create gig" }).click();
  await expect(page.getByTestId("split-viewport")).toBeHidden();
  await expect(eventIn(page, "Quick gig")).toBeVisible();
});

test("gig form requires a title and a date", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "gig");
  await pane.getByRole("button", { name: "Create gig" }).click();
  await expect(pane.getByText("Give the gig a title.")).toBeVisible();
  await expect(pane.getByText("Pick a date.")).toBeVisible();
});

test("clicking a day pre-fills the date", async ({ page }) => {
  await page.goto("/events");
  const date = isoDay(0);
  await calendar(page)
    .locator(`td[data-date="${date}"]`)
    .click({
      position: { x: 10, y: 60 },
    });
  const pane = await pickSide(page, "gig");
  await expect(pane.getByLabel("Date", { exact: true })).toHaveValue(date);
});

test("back arrow returns to the Practice | Gig split", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  await pickSide(page, "practice");
  await expect(page.getByTestId("split-viewport")).toHaveAttribute(
    "data-view",
    "left",
  );
  await page.getByTestId("split-back").click();
  await expect(page.getByTestId("split-viewport")).toHaveAttribute(
    "data-view",
    "split",
  );
});

test("venue type-ahead fills the address from a suggestion", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "gig");
  const venue = pane.getByRole("combobox");
  await venue.fill("bowery");
  await expect(
    page.getByRole("option", { name: /Bowery Ballroom/ }),
  ).toBeVisible();
  await venue.press("ArrowDown");
  await venue.press("Enter");
  await expect(venue).toHaveValue("Bowery Ballroom");
  await expect(pane.getByText("6 Delancey St")).toBeVisible();
});

test("a recurring practice shows a summary and creates its occurrences", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "practice");
  await pane.getByLabel("Title").fill("Horn section");
  const start = `${isoDay(0).slice(0, 8)}03`;
  await pane.getByLabel("Date", { exact: true }).fill(start);
  await pane.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  const days = pane.getByRole("group", { name: "Repeat on" });
  for (const d of ["Tue", "Thu"]) {
    await days.getByRole("button", { name: d }).click();
  }
  await pane.getByLabel("Ends").selectOption("count");
  await pane.getByLabel("Number of occurrences").fill("4");
  await expect(pane.getByTestId("recurrence-summary")).toContainText(
    "Every week on",
  );
  await pane.getByRole("button", { name: "Create practice" }).click();
  await expect(page.getByTestId("split-viewport")).toBeHidden();
  await expect(eventIn(page, "Horn section")).toHaveCount(4);
});

test("untouched drawer closes silently; dirty drawer asks to discard", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("split-viewport")).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "gig");
  await pane.getByLabel("Title").fill("Half done");
  await page.getByRole("button", { name: "Close" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Discard changes?");
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(pane.getByLabel("Title")).toHaveValue("Half done");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("split-viewport")).toBeHidden();
  expect(seed.gigs.upcomingClub.id).toBeTruthy();
});
