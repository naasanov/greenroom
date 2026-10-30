import type { BandSeedResult } from "@greenroom/db";
import { SONGS } from "@greenroom/db";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { AVA, isoDay, pickSide } from "./events-helpers.js";
import { apiAs } from "./library-helpers.js";

let seed: BandSeedResult;
let api: APIRequestContext;
let bandId: string;
let seriesId: string;
let startDate: string;
let dtstart: Date;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  bandId = seed.bands.nightOwls.id;
  await loginAs(AVA);
  api = await apiAs(testApi, AVA);
  startDate = isoDay(3);
  const res = await api.post(`/bands/${bandId}/practices`, {
    data: {
      title: "Horns",
      startDate,
      startTime: "19:00",
      durationMinutes: 120,
      timeZone: "UTC",
      recurrence: { freq: "weekly" },
    },
  });
  expect(res.status()).toBe(201);
  const series = await res.json();
  seriesId = series.id;
  dtstart = new Date(series.dtstart);
});

test.afterEach(async () => {
  await api.dispose();
});

const dateOf = (k: number) =>
  new Date(dtstart.getTime() + k * 7 * 86_400_000).toISOString().slice(0, 10);
const keyOf = (k: number) =>
  new Date(dtstart.getTime() + k * 7 * 86_400_000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
const occUrl = (k: number) =>
  `/bands/${bandId}/practices/${seriesId}/occurrences/${keyOf(k)}`;

const rows = (page: Page) => page.getByTestId("setlist-row");
const libraryRow = (page: Page, title: string) =>
  page.getByTestId("library-picker").getByRole("button", { name: title });

async function occurrence(k: number) {
  return (await api.get(occUrl(k))).json();
}

async function titlesOf(k: number): Promise<string[]> {
  const occ = await occurrence(k);
  if (!occ.setlistId) return [];
  const sl = await (
    await api.get(`/bands/${bandId}/setlists/${occ.setlistId}`)
  ).json();
  return sl.items.map((i: { title: string }) => i.title);
}

/** Gives occurrence k its own setlist (this and following) with these songs. */
async function giveSetlist(
  k: number,
  songs: { id: string }[],
  onConflict: "replace" | "keep" = "replace",
) {
  const res = await api.post(`${occUrl(k)}/setlist`, {
    data: { scope: "this_and_following", onConflict },
  });
  expect(res.status()).toBe(201);
  const { newSetlistId } = await res.json();
  const put = await api.put(`/bands/${bandId}/setlists/${newSetlistId}/items`, {
    data: { songIds: songs.map((s) => s.id) },
  });
  expect(put.ok()).toBe(true);
  return newSetlistId as string;
}

async function openOcc(page: Page, k: number) {
  await page.goto(`/practices/${seriesId}?date=${dateOf(k)}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
}

async function addFromLibrary(page: Page, ...titles: string[]) {
  await page.getByRole("button", { name: "Edit setlist" }).click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
  for (const t of titles) await libraryRow(page, t).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("library-picker")).toBeHidden();
}

async function openLibrary(page: Page) {
  await page.getByRole("button", { name: "Edit setlist" }).click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
}

async function closeLibrary(page: Page) {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("library-picker")).toBeHidden();
}

const conflict = (page: Page) => page.getByRole("alertdialog");

test("adding songs to a practice with no setlist forks from that occurrence", async ({
  page,
}) => {
  await openOcc(page, 1);
  await expect(page.getByTestId("setlist-empty")).toHaveText("Add songs");
  await expect(
    page.getByRole("button", { name: "Edit setlist" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy from a past gig" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Changes apply to this and later practices."),
  ).toBeVisible();

  await addFromLibrary(page, SONGS.skyline.title, SONGS.paperPlanes.title);
  await expect(rows(page)).toHaveCount(2);
  await expect(conflict(page)).toHaveCount(0);

  await expect
    .poll(() => titlesOf(1))
    .toEqual(["Skyline Drive", "Paper Planes"]);
  expect(await titlesOf(0)).toEqual([]);
  expect(await titlesOf(2)).toEqual(["Skyline Drive", "Paper Planes"]);
  expect((await occurrence(1)).setlistStartsHere).toBe(true);

  await openOcc(page, 2);
  await expect(rows(page)).toHaveCount(2);
});

test("editing a later practice forks and leaves the earlier one alone", async ({
  page,
}) => {
  const first = await giveSetlist(0, [SONGS.redLine, SONGS.jamInA]);
  await openOcc(page, 2);
  await expect(rows(page)).toHaveCount(2);
  await addFromLibrary(page, SONGS.lowTide.title);
  await expect(rows(page)).toHaveCount(3);

  await expect.poll(() => titlesOf(2)).toHaveLength(3);
  expect(await titlesOf(0)).toEqual(["Red Line", "Jam in A"]);
  expect((await occurrence(0)).setlistId).toBe(first);
  expect((await occurrence(1)).setlistId).toBe(first);
  expect((await occurrence(2)).setlistId).not.toBe(first);
  expect((await occurrence(3)).setlistId).toBe((await occurrence(2)).setlistId);
});

test.describe("later practices with their own setlist", () => {
  test.beforeEach(async () => {
    await giveSetlist(2, [SONGS.harborLights]);
    await giveSetlist(0, [SONGS.redLine], "keep");
  });

  test("Keep leaves the later setlist and changes the ones between", async ({
    page,
  }) => {
    await openOcc(page, 0);
    await openLibrary(page);
    await libraryRow(page, SONGS.skyline.title).click();
    await expect(conflict(page)).toContainText("has its own setlist");
    await conflict(page).getByRole("button", { name: "Keep" }).click();
    await expect(conflict(page)).toHaveCount(0);
    await closeLibrary(page);
    await expect(rows(page)).toHaveCount(2);

    // The answer is remembered: a second edit does not ask again.
    await page.getByRole("button", { name: "Remove Skyline Drive" }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(conflict(page)).toHaveCount(0);
    await openLibrary(page);
    await libraryRow(page, SONGS.lowTide.title).click();
    await closeLibrary(page);
    await expect(rows(page)).toHaveCount(2);

    await expect.poll(() => titlesOf(0)).toEqual(["Red Line", "Low Tide"]);
    expect(await titlesOf(1)).toEqual(["Red Line", "Low Tide"]);
    expect(await titlesOf(2)).toEqual(["Harbor Lights"]);
  });

  test("Replace runs the setlist forward over the later one", async ({
    page,
  }) => {
    await openOcc(page, 0);
    await openLibrary(page);
    await libraryRow(page, SONGS.skyline.title).click();
    await conflict(page).getByRole("button", { name: "Replace" }).click();
    await closeLibrary(page);
    await expect(rows(page)).toHaveCount(2);

    await expect.poll(() => titlesOf(2)).toEqual(["Red Line", "Skyline Drive"]);
    expect(await titlesOf(0)).toEqual(["Red Line", "Skyline Drive"]);
  });

  test("Cancel makes no change, and a fork keeps the later setlist on Keep", async ({
    page,
  }) => {
    await openOcc(page, 1);
    await openLibrary(page);
    await libraryRow(page, SONGS.skyline.title).click();
    await conflict(page).getByRole("button", { name: "Cancel" }).click();
    await expect(conflict(page)).toHaveCount(0);
    await closeLibrary(page);
    await expect(rows(page)).toHaveCount(1);
    expect(await titlesOf(1)).toEqual(["Red Line"]);

    await openLibrary(page);
    await libraryRow(page, SONGS.skyline.title).click();
    await conflict(page).getByRole("button", { name: "Keep" }).click();
    await closeLibrary(page);
    await expect(rows(page)).toHaveCount(2);

    await expect.poll(() => titlesOf(1)).toEqual(["Red Line", "Skyline Drive"]);
    expect(await titlesOf(0)).toEqual(["Red Line"]);
    expect(await titlesOf(2)).toEqual(["Harbor Lights"]);
  });
});

test("removing the setlist clears it for this and later practices", async ({
  page,
}) => {
  await giveSetlist(1, [SONGS.redLine]);
  await openOcc(page, 1);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove setlist" }).click();
  await expect(page.getByTestId("setlist-empty")).toHaveText("Add songs");
  await expect(
    page.getByRole("button", { name: "Remove setlist" }),
  ).toHaveCount(0);
  await expect.poll(async () => (await occurrence(1)).setlistId).toBeNull();
  expect((await occurrence(3)).setlistId).toBeNull();
});

test("creating a gig opens its drawer with an empty setlist", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "gig");
  await pane.getByLabel("Title").fill("Fresh gig");
  await pane.getByLabel("Date", { exact: true }).fill(isoDay(2));
  await pane.getByRole("button", { name: "Create gig" }).click();
  await expect(page.getByRole("dialog", { name: "Fresh gig" })).toBeVisible();
  await expect(page).toHaveURL(/\/gigs\/[0-9a-f-]+$/);
  await expect(page.getByTestId("setlist-empty")).toBeVisible();
  await expect(page.getByTestId("split-viewport")).toBeHidden();
});

test("creating a practice opens its first occurrence", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const pane = await pickSide(page, "practice");
  await pane.getByLabel("Title").fill("Brass hour");
  await pane.getByLabel("Date", { exact: true }).fill(isoDay(2));
  await pane.getByRole("button", { name: "Create practice" }).click();
  await expect(page.getByRole("dialog", { name: "Brass hour" })).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/practices/[0-9a-f-]+\\?date=${isoDay(2)}$`),
  );
  await expect(page.getByTestId("setlist-empty")).toHaveText("Add songs");
});
