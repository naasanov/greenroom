import type { Page } from "@playwright/test";
import { USERS } from "@greenroom/db";
import type { BandSeedResult } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import {
  apiAs,
  cards,
  fabAction,
  openLibrary,
  sheet,
} from "./library-helpers.js";

const FAKE = "https://tabs.ultimate-guitar.com/tab/fake";
const AVA = USERS.ava.email;
let seed: BandSeedResult;

test.setTimeout(60_000);

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

async function arrange(testApi: TestApi) {
  const api = await apiAs(testApi, AVA);
  const bandId = seed.bands.nightOwls.id;
  const song = async (
    title: string,
    references: { label: string; value: string }[] = [],
    durationSeconds?: number,
  ) => {
    const res = await api.post(`/bands/${bandId}/songs`, {
      data: { title, references, durationSeconds },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).id as string;
  };
  const importChords = async (songId: string, url: string) => {
    const res = await api.post(
      `/bands/${bandId}/chords/songs/${songId}/import`,
      { data: { url } },
    );
    expect(res.ok(), await res.text()).toBe(true);
  };
  return { api, bandId, song, importChords };
}

async function openSong(page: Page, title: string) {
  await openLibrary(page);
  await cards(page).filter({ hasText: title }).click();
  await expect(sheet(page).getByTestId("song-view")).toBeVisible();
}

test("Ultimate Guitar chip adds a reference, saving auto-imports the sheet, reader transposes", async ({
  page,
}) => {
  await openLibrary(page);
  await fabAction(page, "add-song");
  await sheet(page)
    .getByRole("textbox", { name: "Song link or search" })
    .fill("Wonderwall");
  await sheet(page).getByRole("button", { name: "Enter manually" }).click();
  await expect(sheet(page).getByLabel("Title")).toHaveValue("Wonderwall");

  const chip = sheet(page).getByTestId("reference-chip-ultimate-guitar");
  await expect(chip).toBeVisible();
  await expect(
    sheet(page).getByTestId("reference-chip-ultimate-guitar-others"),
  ).toBeVisible();
  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(
    sheet(page)
      .getByTestId("link-row")
      .last()
      .getByRole("combobox", { name: "Reference label" }),
  ).toHaveValue("Ultimate Guitar");
  await expect(
    sheet(page)
      .getByTestId("link-row")
      .last()
      .getByRole("textbox", { name: "Reference value" }),
  ).toHaveValue(`${FAKE}/wonderwall-chords-3`);
  await sheet(page).getByRole("button", { name: "Done" }).click();

  await expect(sheet(page).getByTestId("song-chords-button")).toBeVisible();
  const songId = new URL(page.url()).pathname.split("/").pop();
  expect(songId).toBeTruthy();

  await page.goto(`/songs/${songId}/chords`);
  await expect(page.getByTestId("chords-reader")).toBeVisible();
  const lines = page.getByTestId("chords-line");
  await expect(lines.first()).toBeVisible();
  const before = (await lines.allInnerTexts()).join("|");
  await page.getByTestId("chords-transpose-up").click();
  await expect
    .poll(async () => (await lines.allInnerTexts()).join("|"))
    .not.toBe(before);
});

test("Ultimate Guitar chip in view mode saves the reference right away", async ({
  page,
  testApi,
}) => {
  const { song } = await arrange(testApi);
  await song("Wonderwall");
  await openSong(page, "Wonderwall");
  const chip = sheet(page).getByTestId("reference-chip-ultimate-guitar");
  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(sheet(page).getByTestId("references-edit")).toHaveCount(0);
  await expect(sheet(page).getByTestId("reference-link")).toHaveCount(1);
  await expect(sheet(page).getByTestId("song-chords-button")).toBeVisible();
});

test("Add chords offers the suggestion and other versions", async ({
  page,
  testApi,
}) => {
  const { song } = await arrange(testApi);
  await song("Wonderwall");
  await openSong(page, "Wonderwall");
  await sheet(page).getByTestId("song-chords-add").click();
  await expect(sheet(page).getByTestId("song-chords-suggestion")).toContainText(
    "4.8, 400 ratings",
  );
  await sheet(page).getByTestId("song-chords-other-versions").click();
  await expect(sheet(page).getByTestId("song-chords-version")).toHaveCount(2);
  await sheet(page)
    .getByTestId("song-chords-version")
    .first()
    .getByRole("button")
    .click();
  await expect(sheet(page).getByTestId("song-chords-button")).toBeVisible();
  await expect(sheet(page).getByTestId("song-chords-refresh")).toBeVisible();
});

test("Write my own creates a sheet", async ({ page, testApi }) => {
  const { song } = await arrange(testApi);
  const id = await song("My Original");
  await openSong(page, "My Original");
  await sheet(page).getByTestId("song-chords-add").click();
  await sheet(page).getByTestId("song-chords-write").click();
  const editor = sheet(page).getByTestId("chords-editor");
  await expect(editor).toBeVisible();
  await editor
    .getByTestId("chords-editor-text")
    .fill("[Verse]\nAm    F\nHello darkness my old friend\n");
  await expect(editor.getByTestId("chords-editor-preview")).toContainText(
    "friend",
  );
  await editor.getByTestId("chords-editor-save").click();
  await expect(sheet(page).getByTestId("song-chords-button")).toBeVisible();
  await expect(sheet(page).getByTestId("song-chords-refresh")).toHaveCount(0);

  await page.goto(`/songs/${id}/chords`);
  await expect(page.getByTestId("chords-reader")).toContainText("friend");
});

test("a broken link shows the error and Retry", async ({ page, testApi }) => {
  const { song } = await arrange(testApi);
  await song("Broken Song", [{ label: "Tab", value: `${FAKE}/broken-1` }]);
  await openSong(page, "Broken Song");
  const error = sheet(page).getByTestId("song-chords-error");
  await expect(error).toContainText("Couldn't import chords from this link");
  await sheet(page).getByTestId("song-chords-retry").click();
  await expect(error).toContainText("Couldn't import chords from this link");
  await expect(sheet(page).getByTestId("song-chords-button")).toHaveCount(0);
});

test("an Official tab explains it cannot be imported", async ({
  page,
  testApi,
}) => {
  const { song } = await arrange(testApi);
  await song("Official Song", [
    { label: "Tab", value: `${FAKE}/x-official-1` },
  ]);
  await openSong(page, "Official Song");
  await expect(sheet(page).getByTestId("song-chords-error")).toContainText(
    "Official/Pro tab",
  );
});

test("setlist rows show a chords icon only for songs with a sheet", async ({
  page,
  testApi,
}) => {
  const { api, bandId, song, importChords } = await arrange(testApi);
  const withSheet = await song("Wonderwall", [], 258);
  const without = await song("Plain Song", [], 185);
  await importChords(withSheet, `${FAKE}/wonderwall-chords-3`);
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${seed.gigs.tentative.id}/setlist`)
  ).json();
  const put = await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: { songIds: [withSheet, without] },
  });
  expect(put.ok()).toBe(true);

  await page.goto(`/gigs/${seed.gigs.tentative.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("setlist-row")).toHaveCount(2);
  const icon = page.getByTestId("song-row-chords");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute(
    "aria-label",
    "Open chords for Wonderwall",
  );
  // Durations share a right edge whether or not the row has a chords link.
  const right = async (title: string, time: string) => {
    const box = await page
      .getByTestId("setlist-row")
      .filter({ hasText: title })
      .getByText(time, { exact: true })
      .boundingBox();
    return box!.x + box!.width;
  };
  expect(await right("Wonderwall", "4:18")).toBeCloseTo(
    await right("Plain Song", "3:05"),
    0,
  );
  await icon.click();
  await expect(page).toHaveURL(new RegExp(`/songs/${withSheet}/chords`));
  await expect(page.getByTestId("chords-reader")).toBeVisible();
});
