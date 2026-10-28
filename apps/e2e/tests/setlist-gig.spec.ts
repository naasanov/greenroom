import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { apiAs } from "./library-helpers.js";

const AVA = USERS.ava.email;
let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const rows = (page: Page) => page.getByTestId("setlist-row");
const total = (page: Page) => page.getByTestId("setlist-total");
const libraryRow = (page: Page, title: string) =>
  page.getByTestId("library-picker").getByRole("button", { name: title });
const rowTitles = async (page: Page) =>
  (await rows(page).locator("span.font-semibold").allTextContents()).map((t) =>
    t.trim(),
  );

async function openGig(page: Page, gig: { id: string; title: string }) {
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
}

const librarySide = (page: Page) =>
  page.locator('aside[aria-label="Music Library"]');

/** Waits for a drawer that rises from the bottom to finish its slide. */
async function expectRisen(page: Page, side: Locator) {
  const viewport = page.viewportSize()!;
  await expect(async () => {
    const box = (await side.boundingBox())!;
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(2);
  }).toPass();
}

async function openLibrary(page: Page) {
  await page.getByRole("button", { name: "Add songs" }).click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
  // Drag tests measure rows right after opening, so wait out the slide on desktop.
  if (await librarySide(page).count()) {
    await expectRisen(page, librarySide(page));
  }
}

async function closeLibrary(page: Page) {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("library-picker")).toBeHidden();
}

/** Puts these songs on a gig's setlist through the API. */
async function fillSetlist(
  testApi: Parameters<typeof apiAs>[0],
  gigId: string,
  songIds: string[],
) {
  const api = await apiAs(testApi, AVA);
  const bandId = seed.bands.nightOwls.id;
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gigId}/setlist`)
  ).json();
  const res = await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: { songIds },
  });
  expect(res.ok()).toBe(true);
  await api.dispose();
  return sl.id as string;
}

test("empty setlist offers both ways to start", async ({ page }) => {
  await openGig(page, seed.gigs.tentative);
  await expect(page.getByTestId("setlist-empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add songs" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy from a past gig" }),
  ).toBeVisible();
  await expect(total(page)).toHaveCount(0);
});

test("the library drawer rises from the bottom and offers copying from a past gig", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The bottom-anchored aside is the desktop layout");
  await openGig(page, seed.gigs.tentative);
  await openLibrary(page);

  const side = librarySide(page);
  await expect(side).toHaveAttribute("data-state", "open");
  await expectRisen(page, side);

  const copy = page
    .getByTestId("library-picker")
    .getByRole("button", { name: "Copy from a past gig" });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByTestId("history-picker")).toBeVisible();
  await expect(page.getByTestId("library-picker")).toBeHidden();
  await expect(side).toHaveAttribute("data-state", "closed");

  const history = page.locator('aside[aria-label="Copy from a past gig"]');
  await expectRisen(page, history);
  await history
    .getByRole("button", { name: "Back to the music library" })
    .click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
  await expect(page.getByTestId("history-picker")).toBeHidden();
});

test("tapping library rows adds and removes songs with check marks", async ({
  page,
}) => {
  await openGig(page, seed.gigs.tentative);
  await openLibrary(page);

  const skyline = libraryRow(page, "Skyline Drive");
  const planes = libraryRow(page, "Paper Planes");
  await skyline.click();
  await expect(skyline).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(1);
  await planes.click();
  await expect(planes).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(2);

  // A rapid third and fourth tap keeps order.
  await libraryRow(page, "Low Tide").click();
  await libraryRow(page, "Red Line").click();
  await expect(rows(page)).toHaveCount(4);

  await skyline.click();
  await expect(skyline).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page)).toHaveCount(3);

  await closeLibrary(page);
  expect(await rowTitles(page)).toEqual([
    "Paper Planes",
    "Low Tide",
    "Red Line",
  ]);

  // Survives a reload.
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  expect(await rowTitles(page)).toEqual([
    "Paper Planes",
    "Low Tide",
    "Red Line",
  ]);
});

test("running total counts songs, minutes and songs without a length", async ({
  page,
}) => {
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  await expect(total(page)).toHaveText("5 songs · 11 min · 2 without a length");
});

test("removing a row updates the list and the total", async ({ page }) => {
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Remove Original One" }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(total(page)).toHaveText("4 songs · 11 min · 1 without a length");
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
});

test("a row can be reordered with the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard reorder is a desktop path");
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  const handle = page.getByRole("button", { name: "Reorder Skyline Drive" });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes("/items"),
  );
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await rowTitles(page)).slice(0, 2))
    .toEqual(["Midnight Train", "Skyline Drive"]);
  await saved;
  await page.reload();
  await expect(rows(page)).toHaveCount(5);
  await expect
    .poll(async () => (await rowTitles(page)).slice(0, 2))
    .toEqual(["Midnight Train", "Skyline Drive"]);
});

test("a row can be reordered by dragging its handle", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Pointer drag is covered on desktop");
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  const handle = page.getByRole("button", { name: "Reorder Skyline Drive" });
  const from = (await handle.boundingBox())!;
  const target = (await rows(page).nth(2).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, target.y + target.height - 8, {
    steps: 12,
  });
  // The source row's handle stays fully visible while its overlay is dragged.
  await expect(handle).toBeVisible();
  await expect(
    page.locator('[data-testid="target-row"]', { has: handle }),
  ).toHaveCSS("opacity", "1");
  await page.mouse.up();
  // No drop animation: the overlay is gone as soon as the pointer is released.
  await expect(page.locator('body > div[style*="z-index: 200"]')).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await rowTitles(page)).slice(0, 3))
    .toEqual(["Midnight Train", "Paper Planes", "Skyline Drive"]);
});

test("a library song dragged over the setlist highlights it and appends on drop", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Drag from the library is desktop only");
  // Library drag needs the side layout, which requires a viewport of 1300px or more.
  await page.setViewportSize({ width: 1400, height: 800 });
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  const before = await rowTitles(page);
  await openLibrary(page);

  const target = page.getByTestId("target-setlist");
  await rows(page).nth(1).scrollIntoViewIfNeeded();
  const source = (await libraryRow(page, "Harbor Lights").boundingBox())!;
  const second = (await rows(page).nth(1).boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 20, source.y + 20, { steps: 4 });
  await expect(target).not.toHaveAttribute("data-drop-active", "true");
  await page.mouse.move(second.x + second.width / 2, second.y + 8, {
    steps: 14,
  });
  await expect(target).toHaveAttribute("data-drop-active", "true");
  // No gap, placeholder row or row shifting while hovering.
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByTestId("drop-gap")).toHaveCount(0);
  await page.mouse.up();
  await expect(target).not.toHaveAttribute("data-drop-active", "true");
  // The overlay does not fly back to the library row after the drop.
  await expect(page.locator('body > div[style*="z-index: 200"]')).toHaveCount(
    0,
  );

  await expect(rows(page)).toHaveCount(6);
  expect(await rowTitles(page)).toEqual([...before, "Harbor Lights"]);
  await expect(libraryRow(page, "Harbor Lights")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(rows(page)).toHaveCount(6);
  expect(await rowTitles(page)).toEqual([...before, "Harbor Lights"]);
});

test("dropping a library song outside the setlist adds nothing", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Drag from the library is desktop only");
  // Library drag needs the side layout, which requires a viewport of 1300px or more.
  await page.setViewportSize({ width: 1400, height: 800 });
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(5);
  await openLibrary(page);

  const target = page.getByTestId("target-setlist");
  const source = (await libraryRow(page, "Harbor Lights").boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 20, source.y + 20, { steps: 4 });
  await page.mouse.move(source.x + 40, source.y + 40, { steps: 4 });
  await expect(target).not.toHaveAttribute("data-drop-active", "true");
  await page.mouse.up();

  await page.waitForTimeout(300);
  await expect(rows(page)).toHaveCount(5);
  await expect(libraryRow(page, "Harbor Lights")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("a library song can be dropped at the end of an empty setlist", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Drag from the library is desktop only");
  // Library drag needs the side layout, which requires a viewport of 1300px or more.
  await page.setViewportSize({ width: 1400, height: 800 });
  await openGig(page, seed.gigs.tentative);
  await openLibrary(page);
  await libraryRow(page, "Skyline Drive").scrollIntoViewIfNeeded();
  const source = (await libraryRow(page, "Skyline Drive").boundingBox())!;
  const zone = (await page.getByTestId("setlist-empty").boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 20, source.y + 20, { steps: 4 });
  await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, {
    steps: 14,
  });
  await expect(page.getByTestId("target-setlist")).toHaveAttribute(
    "data-drop-active",
    "true",
  );
  await page.mouse.up();
  await expect(rows(page)).toHaveCount(1);
  expect(await rowTitles(page)).toEqual(["Skyline Drive"]);
});

test.describe("copy from a past gig", () => {
  test.beforeEach(async ({ testApi }) => {
    await fillSetlist(testApi, seed.gigs.pastBar.id, [
      SONGS.redLine.id,
      SONGS.harborLights.id,
    ]);
    await fillSetlist(testApi, seed.gigs.pastFestival.id, [SONGS.jamInA.id]);
  });

  async function openHistory(page: Page) {
    await page.getByRole("button", { name: "Copy from a past gig" }).click();
    await expect(page.getByTestId("history-picker")).toBeVisible();
  }

  test("lists past gigs newest first and filters by search", async ({
    page,
  }) => {
    await openGig(page, seed.gigs.tentative);
    await openHistory(page);
    const entries = page.getByTestId("history-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("The Rusty Anchor");
    await expect(entries.nth(0)).toContainText("2 songs");
    await expect(entries.nth(1)).toContainText("Summer Fest");
    await page.getByLabel("Search past gigs").fill("Riverside");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText("Summer Fest");
  });

  test("a row expands to preview its songs without copying", async ({
    page,
  }) => {
    await openGig(page, seed.gigs.tentative);
    await openHistory(page);
    await page.getByTestId("history-preview-toggle").first().click();
    const preview = page.getByTestId("history-preview");
    await expect(preview).toContainText("Red Line");
    await expect(preview).toContainText("Harbor Lights");
    await expect(page.getByTestId("history-picker")).toBeVisible();
  });

  test("into an empty setlist copies without asking", async ({ page }) => {
    await openGig(page, seed.gigs.tentative);
    await openHistory(page);
    await page.getByTestId("history-entry").first().click();
    await expect(rows(page)).toHaveCount(2);
    expect(await rowTitles(page)).toEqual(["Red Line", "Harbor Lights"]);
    await expect(total(page)).toHaveText("2 songs · 2 without a length");
  });

  test("into a filled setlist asks, and Replace swaps the songs", async ({
    page,
  }) => {
    await openGig(page, seed.gigs.upcomingClub);
    await expect(rows(page)).toHaveCount(5);
    await openHistory(page);
    await page.getByTestId("history-entry").first().click();
    const ask = page.getByRole("alertdialog");
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Replace" }).click();
    await expect(rows(page)).toHaveCount(2);
    expect(await rowTitles(page)).toEqual(["Red Line", "Harbor Lights"]);
  });

  test("into a filled setlist, Add to end appends", async ({ page }) => {
    await openGig(page, seed.gigs.upcomingClub);
    await expect(rows(page)).toHaveCount(5);
    await openHistory(page);
    await page.getByTestId("history-entry").first().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Add to end" })
      .click();
    await expect(rows(page)).toHaveCount(7);
    expect((await rowTitles(page)).slice(5)).toEqual([
      "Red Line",
      "Harbor Lights",
    ]);
  });
});

test("a YouTube-only song shows its thumbnail in the setlist row", async ({
  page,
  testApi,
}) => {
  await fillSetlist(testApi, seed.gigs.tentative.id, [SONGS.midnightTrain.id]);
  await openGig(page, seed.gigs.tentative);
  await expect(rows(page).first().locator("img")).toHaveAttribute(
    "src",
    /i\.ytimg\.com/,
  );
});

test("adding a new song in place appends it to the setlist", async ({
  page,
}) => {
  await openGig(page, seed.gigs.tentative);
  await openLibrary(page);
  await page.getByRole("button", { name: "Add a new song" }).click();
  const sheet = page.getByRole("dialog", { name: "Add song" });
  await expect(sheet).toContainText("Add song");
  await sheet.getByRole("button", { name: "Enter manually" }).click();
  await sheet.getByLabel("Title").fill("Brand New Tune");
  await sheet.getByLabel("Artist").fill("Us");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(await rowTitles(page)).toEqual(["Brand New Tune"]);
  await expect(libraryRow(page, "Brand New Tune")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a search with no matches offers Add this song with the text prefilled", async ({
  page,
}) => {
  await openGig(page, seed.gigs.tentative);
  await openLibrary(page);
  await page.getByLabel("Search the library").fill("Zebra Crossing");
  await expect(page.getByTestId("library-no-match")).toBeVisible();
  await page.getByRole("button", { name: "Add this song" }).click();
  const sheet = page.getByRole("dialog", { name: "Add song" });
  await expect(
    sheet.getByRole("textbox", { name: "Song link or search" }),
  ).toHaveValue("Zebra Crossing");
  await sheet.getByRole("button", { name: "Enter manually" }).click();
  await expect(sheet.getByLabel("Title")).toHaveValue("Zebra Crossing");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(await rowTitles(page)).toEqual(["Zebra Crossing"]);
});
