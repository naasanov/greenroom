import { SONGS, USERS } from "@greenroom/db";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import {
  BAND,
  DRIVE,
  FakeDrive,
  clientFor,
  linkDrive,
  setupDrive,
} from "./api-media-helpers.js";
import { cards, openLibrary, sheet } from "./library-helpers.js";

const FILES = `/bands/${BAND}/files`;

async function pickerFolder(ava: APIRequestContext, name: string) {
  const picker = await (await ava.get(`${DRIVE}/fake-picker`)).json();
  return picker.folders.find((f: { name: string }) => f.name === name)
    .id as string;
}

async function driveStatus(ava: APIRequestContext) {
  return (await ava.get(`${DRIVE}/status`)).json() as Promise<{
    folderId: string | null;
    gigsFolderId: string | null;
  }>;
}

async function openDriveChooser(page: Page) {
  await page.goto("/settings");
  await page
    .getByTestId("settings-google-drive")
    .getByRole("button", { name: "Choose folder" })
    .click();
}

/** Links Drive over the API and returns an unpicked "Shows" folder inside Band stuff. */
async function linkedWithShows(ava: APIRequestContext, fake: FakeDrive) {
  await linkDrive(ava);
  const band = await pickerFolder(ava, "Band stuff");
  const shows = await fake.external({
    action: "folder",
    name: "Shows",
    parentId: band,
  });
  return { band, shows: shows.id as string };
}

test.describe("Drive import: gigs root step", () => {
  test.beforeEach(async ({ testApi, loginAs }) => {
    await testApi.seed("band");
    await loginAs(USERS.ava.email);
  });

  test("choose an existing folder as the gigs root", async ({
    page,
    testApi,
  }) => {
    const ava = await clientFor(testApi, USERS.ava.email);
    const fake = await FakeDrive.create();
    const { band, shows } = await linkedWithShows(ava, fake);

    await openDriveChooser(page);
    const picker = page.getByTestId("drive-picker");
    await picker.getByRole("button", { name: "Band stuff" }).click();
    await expect(
      picker.getByRole("heading", { name: "Where do your gigs go?" }),
    ).toBeVisible();
    await expect(picker).toContainText("nothing in Drive is moved or renamed");
    await expect(picker).toContainText("not gigs until you link them");
    await expect(
      picker.getByRole("radio", { name: "Gigs", exact: true }),
    ).toBeChecked();
    await picker.getByRole("radio", { name: "Shows" }).check();
    await picker.getByRole("button", { name: "Confirm" }).click();
    await expect(picker).toBeHidden();

    await expect(page.getByTestId("settings-google-gigs-folder")).toContainText(
      "Gigs folder: Shows",
    );
    const status = await driveStatus(ava);
    expect(status.folderId).toBe(band);
    expect(status.gigsFolderId).toBe(shows);
  });

  test("create a new Gigs folder", async ({ page, testApi }) => {
    const ava = await clientFor(testApi, USERS.ava.email);
    const fake = await FakeDrive.create();
    await linkedWithShows(ava, fake);

    await openDriveChooser(page);
    const picker = page.getByTestId("drive-picker");
    await picker.getByRole("button", { name: "Band stuff" }).click();
    const reused = (await driveStatus(ava)).gigsFolderId;
    await picker
      .getByRole("radio", { name: "Create a new Gigs folder" })
      .check();
    await picker.getByRole("button", { name: "Confirm" }).click();
    await expect(picker).toBeHidden();

    await expect
      .poll(async () => (await driveStatus(ava)).gigsFolderId)
      .not.toBe(reused);
    await expect(page.getByTestId("settings-google-gigs-folder")).toContainText(
      "Gigs folder: Gigs",
    );
  });

  test("skip keeps the default Gigs folder", async ({ page, testApi }) => {
    const ava = await clientFor(testApi, USERS.ava.email);
    const fake = await FakeDrive.create();
    await linkedWithShows(ava, fake);

    await openDriveChooser(page);
    const picker = page.getByTestId("drive-picker");
    await picker.getByRole("button", { name: "Band stuff" }).click();
    const kept = (await driveStatus(ava)).gigsFolderId;
    expect(kept).toBeTruthy();
    await picker.getByRole("button", { name: "Keep Gigs" }).click();
    await expect(picker).toBeHidden();
    expect((await driveStatus(ava)).gigsFolderId).toBe(kept);
    await expect(page.getByTestId("settings-google-gigs-folder")).toContainText(
      "Gigs folder: Gigs",
    );
  });

  test("admins change the gigs folder later from settings", async ({
    page,
    testApi,
  }) => {
    const ava = await clientFor(testApi, USERS.ava.email);
    const fake = await FakeDrive.create();
    await linkDrive(ava);
    const band = await pickerFolder(ava, "Band stuff");
    const shows = await fake.external({
      action: "folder",
      name: "Shows",
      parentId: band,
    });
    await ava.post(`${DRIVE}/folder`, { data: { folderId: band } });

    await page.goto("/settings");
    const line = page.getByTestId("settings-google-gigs-folder");
    await expect(line).toContainText("Gigs folder: Gigs");
    await line.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByTestId("gigs-root-dialog");
    await dialog.getByRole("radio", { name: "Shows" }).check();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog).toBeHidden();
    await expect(line).toContainText("Gigs folder: Shows");
    expect((await driveStatus(ava)).gigsFolderId).toBe(shows.id);
  });
});

test.describe("link an existing folder to a gig", () => {
  let gig: { id: string; title: string };
  let other: { id: string; title: string };
  let ava: APIRequestContext;
  let fake: FakeDrive;
  let band: string;

  test.beforeEach(async ({ testApi, loginAs }) => {
    const seed = await testApi.seed("band");
    gig = seed.gigs.upcomingClub;
    other = seed.gigs.pastBar;
    await loginAs(USERS.ava.email);
    ava = await clientFor(testApi, USERS.ava.email);
    fake = await FakeDrive.create();
    band = (await setupDrive(ava)).folderId;
  });

  async function openLinkDialog(page: Page) {
    await page.goto(`/gigs/${gig.id}/media`);
    await page.getByTestId("media-link-folder").click();
    return page.getByTestId("folder-picker");
  }

  test("browse, link, and see the files in the gig media", async ({ page }) => {
    const old = await fake.external({
      action: "folder",
      name: "Old show",
      parentId: band,
    });
    await fake.external({
      action: "add",
      name: "old.png",
      parentId: old.id,
      mimeType: "image/png",
      content: "old",
    });

    const dialog = await openLinkDialog(page);
    await expect(
      dialog.getByRole("button", { name: "Old show" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Old show" }).click();
    await expect(
      dialog.getByRole("navigation", { name: "Breadcrumbs" }),
    ).toContainText("Old show");
    await dialog.getByRole("button", { name: "Link this folder" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByTestId("media-name").filter({ hasText: "old.png" }),
    ).toBeVisible();
  });

  test("a gig that already has a folder gets a friendly error", async ({
    page,
  }) => {
    const first = await fake.external({
      action: "folder",
      name: "First",
      parentId: band,
    });
    await fake.external({ action: "folder", name: "Second", parentId: band });
    const res = await ava.post(
      `/bands/${BAND}/gigs/${gig.id}/media/link-folder`,
      { data: { folderId: first.id } },
    );
    expect(res.status()).toBe(200);

    const dialog = await openLinkDialog(page);
    await dialog.getByRole("button", { name: "Second" }).click();
    await dialog.getByRole("button", { name: "Link this folder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "This gig already has a Drive folder.",
    );
  });

  test("a folder used by another gig gets a friendly error", async ({
    page,
  }) => {
    const shared = await fake.external({
      action: "folder",
      name: "Shared",
      parentId: band,
    });
    const res = await ava.post(
      `/bands/${BAND}/gigs/${other.id}/media/link-folder`,
      { data: { folderId: shared.id } },
    );
    expect(res.status()).toBe(200);

    const dialog = await openLinkDialog(page);
    await dialog.getByRole("button", { name: "Shared" }).click();
    await dialog.getByRole("button", { name: "Link this folder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "That folder is already linked to another gig.",
    );
  });
});

test.describe("song detail Files section", () => {
  let ava: APIRequestContext;
  let fake: FakeDrive;
  let band: string;

  test.beforeEach(async ({ testApi, loginAs }) => {
    await testApi.seed("band");
    await loginAs(USERS.ava.email);
    ava = await clientFor(testApi, USERS.ava.email);
    fake = await FakeDrive.create();
    band = (await setupDrive(ava)).folderId;
  });

  async function addFile(name: string, link: boolean) {
    const f = await fake.external({
      action: "add",
      name,
      parentId: band,
      mimeType: "application/pdf",
      content: name,
    });
    if (link) {
      const res = await ava.put(`${FILES}/items/${f.id}/songs`, {
        data: { songIds: [SONGS.skyline.id] },
      });
      expect(res.status()).toBe(200);
    }
    return f.id as string;
  }

  async function openSong(page: Page) {
    await openLibrary(page);
    await cards(page).filter({ hasText: SONGS.skyline.title }).click();
    return sheet(page).getByTestId("song-files");
  }

  test("lists linked files and marks trashed ones unavailable", async ({
    page,
  }) => {
    await addFile("chart.pdf", true);
    const gone = await addFile("old chart.pdf", true);
    await fake.external({ action: "trash", fileId: gone });

    const files = await openSong(page);
    const live = files
      .getByTestId("song-file")
      .filter({ hasText: "chart.pdf" });
    await expect(
      files.locator('[data-name="chart.pdf"][data-available="true"]'),
    ).toBeVisible();
    await expect(
      files.getByRole("link", { name: "Open chart.pdf" }),
    ).toBeVisible();
    await expect(live).toHaveCount(2);
    const unavailable = files.locator(
      '[data-name="old chart.pdf"][data-available="false"]',
    );
    await expect(unavailable).toContainText("File unavailable");
    await expect(
      files.getByRole("button", { name: "Unlink old chart.pdf" }),
    ).toBeVisible();
  });

  test("unlinks an unavailable (trashed) file", async ({ page }) => {
    await addFile("chart.pdf", true);
    const gone = await addFile("old chart.pdf", true);
    await fake.external({ action: "trash", fileId: gone });

    const files = await openSong(page);
    await files.getByRole("button", { name: "Unlink old chart.pdf" }).click();
    await expect(files.getByTestId("song-file")).toHaveCount(1);
    await expect(files.locator('[data-name="old chart.pdf"]')).toHaveCount(0);
    const songs = await (
      await ava.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
    ).json();
    expect(songs.map((f: { name: string }) => f.name)).toEqual(["chart.pdf"]);
  });

  test("unlink removes the song from the file", async ({ page }) => {
    const id = await addFile("chart.pdf", true);
    const files = await openSong(page);
    await files.getByRole("button", { name: "Unlink chart.pdf" }).click();
    await expect(files.getByTestId("song-file")).toHaveCount(0);
    await expect(files).toContainText("No files linked.");
    const songs = await (
      await ava.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
    ).json();
    expect(songs).toHaveLength(0);
    expect(id).toBeTruthy();
  });

  test("add file links a picked file to the song", async ({ page }) => {
    await addFile("lyrics.pdf", false);
    const files = await openSong(page);
    await expect(files).toContainText("No files linked.");
    await files.getByRole("button", { name: "Add file" }).click();
    const dialog = page.getByTestId("folder-picker");
    await dialog.getByRole("button", { name: "Select lyrics.pdf" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      files.locator('[data-name="lyrics.pdf"][data-available="true"]'),
    ).toBeVisible();
  });
});
