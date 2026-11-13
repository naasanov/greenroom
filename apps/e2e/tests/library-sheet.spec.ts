import {
  USERS,
  practiceSeries,
  practiceSetlistAssignments,
} from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { cards, chooseSort, openLibrary, sheet } from "./library-helpers.js";

// Route stubs cannot intercept requests from a page controlled by the service worker (WebKit).
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("view mode shows fields, link references and Used in", async ({
  page,
}) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  const s = sheet(page);
  await expect(s.getByTestId("reference-link")).toHaveCount(2);
  await expect(s.getByTestId("reference-link").first()).toContainText(
    "Guitar tab",
  );
  await expect(s.getByTestId("reference-link").first()).toHaveAttribute(
    "href",
    "https://tabs.example.com/skyline",
  );
  await expect(s.getByTestId("used-in")).toBeVisible();
  await expect(s.getByRole("button", { name: "Share link" })).toBeVisible();

  await s.getByRole("button", { name: "Close" }).click();
  await cards(page).filter({ hasText: "Original One" }).click();
  await expect(s).toContainText("Count in 4 bars");
});

test("edit in place: plain-text reference renders without a link", async ({
  page,
}) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Original One" }).click();
  const s = sheet(page);
  const editButton = s.getByRole("button", { name: "Edit" });
  const box = await editButton.boundingBox();
  const share = (await s
    .getByRole("button", { name: "Share link" })
    .boundingBox())!;
  // Share and Edit sit together as one cluster.
  expect(box!.x - (share.x + share.width)).toBeLessThan(8);
  await editButton.click();
  // Edit becomes a text Cancel, so the header holds a single X (Close).
  const cancel = s.getByRole("button", { name: "Cancel" });
  await expect(cancel).toHaveText("Cancel");
  await expect(cancel.locator("svg")).toHaveCount(0);
  const cancelBox = (await cancel.boundingBox())!;
  expect(cancelBox.x + cancelBox.width).toBeCloseTo(box!.x + box!.width, 0);

  await s.getByRole("button", { name: "Add row" }).click();
  await s.getByLabel("Reference label").last().fill("Key");
  await s.getByLabel("Reference value").last().fill("F# minor, 105 bpm");
  await s.getByLabel("Title").fill("Original One (v2)");
  await s.getByRole("button", { name: "Save" }).click();

  await expect(s.getByTestId("song-view")).toContainText("Original One (v2)");
  const text = s.getByTestId("reference-text");
  await expect(text).toContainText("F# minor, 105 bpm");
  await expect(text.locator("a")).toHaveCount(0);
  await expect(s.getByTestId("reference-link")).toHaveCount(1);
  await expect(
    cards(page).filter({ hasText: "Original One (v2)" }),
  ).toHaveCount(1);
});

test("cancelling a dirty edit asks to discard", async ({ page }) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Jam in A" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit" }).click();
  await s.getByLabel("Title").fill("Changed");
  await s.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(s.getByTestId("song-view")).toContainText("Jam in A");
  await expect(s.getByTestId("song-view")).not.toContainText("Changed");
});

test("delete warns about setlists and removes the song", async ({ page }) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit" }).click();
  await s.getByRole("button", { name: "Delete song" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/This is in \d+ setlists?\./);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(cards(page).filter({ hasText: "Skyline Drive" })).toHaveCount(0);
});

test("mobile arrows move through the list order", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Arrows are a mobile control");
  await openLibrary(page);
  await chooseSort(page, "Title A-Z");
  await cards(page).first().click();
  const s = sheet(page);
  await expect(s).toContainText("Harbor Lights");
  await expect(s.getByRole("button", { name: "Previous" })).toBeDisabled();
  await s.getByRole("button", { name: "Next" }).click();
  await expect(s).toContainText("Jam in A");
  await expect(page).toHaveURL(/\/songs\//);
  await s.getByRole("button", { name: "Previous" }).click();
  await expect(s).toContainText("Harbor Lights");
});

test("sheet shows the summary immediately while detail loads", async ({
  page,
}) => {
  await openLibrary(page);
  await page.route("**/bands/*/songs/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });
  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  const s = sheet(page);
  await expect(s.getByTestId("song-view")).toContainText("Skyline Drive");
  await expect(s.getByTestId("song-detail-skeleton")).toBeVisible();
  await expect(s.getByRole("img", { name: "Loading" })).toHaveCount(0);
  await expect(s.getByTestId("reference-link").first()).toBeVisible();
  await expect(s.getByTestId("song-detail-skeleton")).toHaveCount(0);
});

test("edit mode stacks the reference label above the link", async ({
  page,
}) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit" }).click();
  const label = s.getByLabel("Reference label").first();
  const value = s.getByLabel("Reference value").first();
  const l = (await label.boundingBox())!;
  const v = (await value.boundingBox())!;
  expect(v.y).toBeGreaterThan(l.y + l.height - 1);
  expect(Math.abs(v.x - l.x)).toBeLessThan(2);
  expect(l.width).toBeGreaterThan(v.width * 0.6);
});

test("desktop sheet is non-modal: another song switches it, other clicks close it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the sheet is a full-screen overlay on mobile");
  await openLibrary(page);
  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  const s = sheet(page);
  await expect(s).toContainText("Skyline Drive");

  await cards(page).filter({ hasText: "Original One" }).click();
  await expect(s).toContainText("Count in 4 bars");
  await expect(s).toBeVisible();

  await page.getByRole("heading", { name: "Music Library" }).click();
  await expect(s).toBeHidden();
});

test("the References pencil edits only the references", async ({ page }) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Original One" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit references" }).click();
  // Song details stay in view mode.
  await expect(s.getByLabel("Title")).toHaveCount(0);
  await s.getByRole("button", { name: "Add row" }).click();
  await s.getByLabel("Reference label").last().fill("Key");
  await s.getByLabel("Reference value").last().fill("A minor");
  await s.getByRole("button", { name: "Save references" }).click();
  await expect(s.getByTestId("references-edit")).toHaveCount(0);
  await expect(s.getByTestId("reference-text")).toContainText("A minor");
  await expect(
    s.getByRole("button", { name: "Edit references" }),
  ).toBeVisible();
  await expect(
    s.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
});

test("Used in is last, after Files, and lists one upcoming practice", async ({
  page,
  db,
}) => {
  const [series] = await db.select().from(practiceSeries);
  const [assignment] = await db
    .select()
    .from(practiceSetlistAssignments)
    .where(eq(practiceSetlistAssignments.seriesId, series!.id));
  const day = 86_400_000;
  const extras = [
    { rrule: "RRULE:COUNT=1", offset: -9 },
    { rrule: "RRULE:COUNT=1", offset: 40 },
  ];
  for (const [i, e] of extras.entries()) {
    const [row] = await db
      .insert(practiceSeries)
      .values({
        ...series!,
        id: undefined,
        title: `Extra practice ${i}`,
        rrule: e.rrule,
        dtstart: new Date(Date.now() + e.offset * day),
      })
      .returning();
    await db.insert(practiceSetlistAssignments).values({
      ...assignment!,
      id: undefined,
      seriesId: row!.id,
      effectiveFrom: row!.dtstart,
    });
  }
  await openLibrary(page);
  await cards(page).filter({ hasText: "Red Line" }).click();
  const s = sheet(page);
  await expect(s.getByTestId("used-in")).toBeVisible();
  const headings = await s.locator("h3").allTextContents();
  expect(headings.at(-1)).toBe("Used in");
  expect(headings.indexOf("Files")).toBeGreaterThan(-1);
  expect(headings.indexOf("Files")).toBeLessThan(headings.indexOf("Used in"));
  const practices = s
    .getByTestId("used-in")
    .locator('li:has(span:text-is("Practice"))');
  await expect(practices).toHaveCount(1);
  await expect(practices).not.toContainText("Extra practice 0");
});
