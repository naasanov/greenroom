import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import {
  bar,
  barButton,
  openGallery,
  section,
  seedGigMedia,
  tile,
  type MediaSeed,
} from "./media-gallery-helpers.js";

let seed: BandSeedResult;
let m: MediaSeed;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, {
    unsorted: ["u1.png", "u2.png", "clip.mp4"],
    folders: { Stage: ["s1.png"], Posed: [] },
  });
});

const mediaState = async () =>
  (await (await m.ava.get(`/bands/${BAND}/gigs/${m.gigId}/media`)).json()) as {
    unsorted: { id: string; name: string; songId: string | null }[];
    folders: {
      id: string;
      name: string;
      items: { id: string; name: string; songId: string | null }[];
    }[];
  };

test("strip opens the full view, close returns to the gig drawer", async ({
  page,
}) => {
  await page.goto(`/gigs/${m.gigId}`);
  const drawer = page.getByRole("dialog", { name: m.gigTitle }).last();
  await drawer.getByTestId("media-strip").click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${m.gigId}/media$`));
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await page.getByTestId("media-close").click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${m.gigId}$`));
  await expect(page.getByTestId("media-gallery")).toBeHidden();
  await expect(drawer).toBeVisible();
});

test("back button returns to the gig", async ({ page }) => {
  await page.goto(`/gigs/${m.gigId}`);
  await page
    .getByRole("dialog", { name: m.gigTitle })
    .getByTestId("media-strip")
    .click();
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("media-gallery")).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: m.gigTitle }).last(),
  ).toBeVisible();
});

test("sections list Unsorted first, then folders, with a play badge and counts", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const names = await page
    .getByTestId("media-section")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
  expect(names).toEqual(["Unsorted", "Stage", "Posed"]);
  await expect(section(page, "Unsorted").getByTestId("media-tile")).toHaveCount(
    3,
  );
  await expect(
    tile(page, "clip.mp4").getByTestId("media-play-badge"),
  ).toBeVisible();
  await expect(section(page, "Posed")).toContainText("Empty folder");
});

test("empty Unsorted is hidden when folders exist", async ({ page }) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  for (const n of ["u1.png", "u2.png", "clip.mp4"]) {
    await tile(page, n).getByTestId("media-open").click();
  }
  await barButton(page, "Move to folder").click();
  await page.getByRole("button", { name: "Move to Stage" }).click();
  await expect(section(page, "Unsorted")).toHaveCount(0);
  await expect(section(page, "Stage").getByTestId("media-tile")).toHaveCount(4);
});

test("collapse, expand and jump between sections", async ({ page }) => {
  await openGallery(page, m.gigId);
  const unsorted = section(page, "Unsorted");
  await unsorted.getByTestId("section-toggle").click();
  await expect(unsorted.getByTestId("media-tile")).toHaveCount(0);
  await unsorted.getByTestId("section-toggle").click();
  await expect(unsorted.getByTestId("media-tile")).toHaveCount(3);
  await expect(unsorted.getByTestId("section-up")).toBeDisabled();
  await unsorted.getByTestId("section-down").click();
  await expect(
    section(page, "Stage").getByTestId("section-toggle"),
  ).toBeInViewport();
  await section(page, "Stage").getByTestId("section-up").click();
  await expect(unsorted.getByTestId("section-toggle")).toBeInViewport();
  // Collapsed state is not persisted.
  await unsorted.getByTestId("section-toggle").click();
  await page.reload();
  await expect(section(page, "Unsorted").getByTestId("media-tile")).toHaveCount(
    3,
  );
});

test("density toggle changes the layout and is remembered", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const main = page.getByTestId("media-gallery").locator("main");
  await expect(main).toHaveAttribute("data-density", "large");
  await page.getByRole("radio", { name: "Compact previews" }).click();
  await expect(main).toHaveAttribute("data-density", "compact");
  await page.getByRole("radio", { name: "Names only" }).click();
  await expect(main).toHaveAttribute("data-density", "names");
  await expect(tile(page, "u1.png").getByTestId("media-thumb")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("media-gallery").locator("main"),
  ).toHaveAttribute("data-density", "names");
});

test("select, tap-to-place into a folder, select all and deselect all", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  await tile(page, "u1.png").getByTestId("media-open").click();
  await tile(page, "u2.png").getByTestId("media-open").click();
  await expect(page.getByTestId("selection-count")).toHaveText("2");
  await expect(page.getByTestId("move-here")).toHaveCount(3);
  // A stray tap toggles instead of opening the viewer.
  await tile(page, "u2.png").getByTestId("media-open").click();
  await expect(page.getByTestId("selection-count")).toHaveText("1");
  await expect(page.getByTestId("media-viewer")).toHaveCount(0);

  await barButton(page, "Select all").click();
  await expect(page.getByTestId("selection-count")).toHaveText("4");
  await expect(barButton(page, "Deselect all")).toBeVisible();
  await barButton(page, "Deselect all").click();
  await expect(page.getByTestId("selection-count")).toHaveText("0");

  await tile(page, "u1.png").getByTestId("media-open").click();
  await tile(page, "u2.png").getByTestId("media-open").click();
  await section(page, "Posed").getByTestId("move-here").click();
  await expect(section(page, "Posed").getByTestId("media-tile")).toHaveCount(2);
  await expect(bar(page)).toHaveAttribute("data-visible", "false");
  await expect
    .poll(
      async () =>
        (await mediaState()).folders.find((f) => f.name === "Posed")!.items
          .length,
    )
    .toBe(2);
});

test("long press starts a selection", async ({ page }) => {
  await openGallery(page, m.gigId);
  const open = tile(page, "u1.png").getByTestId("media-open");
  const box = (await open.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("1");
  await expect(tile(page, "u1.png")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("media-viewer")).toHaveCount(0);
});

test("move to folder through the action bar menu", async ({ page }) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  await tile(page, "clip.mp4").getByTestId("media-open").click();
  await barButton(page, "Move to folder").click();
  await page.getByRole("button", { name: "Move to Posed" }).click();
  await expect(section(page, "Posed").getByTestId("media-tile")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await mediaState()).folders.find((f) => f.name === "Posed")!.items
          .length,
    )
    .toBe(1);
});

test("tapping the name label renames inline", async ({ page }) => {
  await openGallery(page, m.gigId);
  const label = tile(page, "u1.png").getByTestId("media-name");
  const box = (await label.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43);
  await label.click();
  const input = page.getByTestId("media-name-input");
  await input.fill("opener.png");
  await input.press("Enter");
  await expect(tile(page, "opener.png")).toBeVisible();
  await expect
    .poll(async () => (await mediaState()).unsorted.map((i) => i.name))
    .toContain("opener.png");
});

test("rename through the action bar needs exactly one item", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  await tile(page, "u1.png").getByTestId("media-open").click();
  await tile(page, "u2.png").getByTestId("media-open").click();
  await expect(barButton(page, "Rename")).toHaveCount(0);
  await tile(page, "u2.png").getByTestId("media-open").click();
  await barButton(page, "Rename").click();
  const input = page.getByTestId("media-name-input");
  await input.fill("renamed.png");
  await input.press("Enter");
  await expect(tile(page, "renamed.png")).toBeVisible();
});

test("delete confirms and moves items to Drive trash", async ({ page }) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  await tile(page, "u1.png").getByTestId("media-open").click();
  await tile(page, "u2.png").getByTestId("media-open").click();
  await barButton(page, "Delete").click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Move 2 items to Google Drive trash? You can restore them from Drive.",
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(tile(page, "u1.png")).toBeVisible();
  await barButton(page, "Delete").click();
  await page.getByRole("button", { name: "Move to trash" }).click();
  await expect(tile(page, "u1.png")).toHaveCount(0);
  await expect
    .poll(async () => (await m.fake.byName("u1.png"))?.trashed)
    .toBe(true);
});

test("folders: create, rename, reorder and delete when empty", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("new-folder").click();
  await page.getByLabel("Folder name").fill("Flyer");
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(section(page, "Flyer")).toBeVisible();

  await page.getByRole("button", { name: "Options for Flyer" }).click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  await page.getByLabel("Folder name").fill("Posters");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(section(page, "Posters")).toBeVisible();

  await page.getByRole("button", { name: "Options for Posters" }).click();
  await page.getByRole("menuitem", { name: "Move folder up" }).click();
  await expect
    .poll(async () => (await mediaState()).folders.map((f) => f.name))
    .toEqual(["Stage", "Posters", "Posed"]);
  const names = await page
    .getByTestId("media-section")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
  expect(names).toEqual(["Unsorted", "Stage", "Posters", "Posed"]);

  await page.getByRole("button", { name: "Options for Stage" }).click();
  await expect(
    page.getByRole("menuitem", { name: /Delete folder/ }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Options for Posters" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  await expect(section(page, "Posters")).toHaveCount(0);
  await expect
    .poll(async () => (await mediaState()).folders.map((f) => f.name))
    .toEqual(["Stage", "Posed"]);
});

test("viewer opens, steps to the next item and offers a download link", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await tile(page, "u1.png").getByTestId("media-open").click();
  const viewer = page.getByTestId("media-viewer");
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId("viewer-name")).toHaveText("u1.png");
  await expect(page.getByTestId("viewer-download")).toHaveAttribute(
    "href",
    /\/content\?download=1$/,
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-name")).toHaveText("u2.png");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-name")).toHaveText("clip.mp4");
  await expect(page.getByTestId("viewer-video")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("viewer-name")).toHaveText("u2.png");
  await page.getByRole("button", { name: "Close viewer" }).click();
  await expect(viewer).toHaveCount(0);
});

test("link to song lists setlist songs first and renames unrenamed items", async ({
  page,
}) => {
  const sl = await (
    await m.ava.get(`/bands/${BAND}/gigs/${m.gigId}/setlist`)
  ).json();
  const put = await m.ava.put(`/bands/${BAND}/setlists/${sl.id}/items`, {
    data: { songIds: [SONGS.lowTide.id] },
  });
  expect(put.ok()).toBe(true);

  await openGallery(page, m.gigId);
  await page.getByTestId("select-start").click();
  await tile(page, "u1.png").getByTestId("media-open").click();
  await barButton(page, "Link to song").click();
  const rows = page.getByTestId("song-pick-row");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toHaveAttribute("data-group", "setlist");
  await expect(rows.first()).toHaveAccessibleName(SONGS.lowTide.title);
  await rows.first().click();

  await expect(tile(page, "Low Tide.png")).toBeVisible();
  await expect(tile(page, "Low Tide.png").getByTestId("media-song")).toHaveText(
    SONGS.lowTide.title,
  );
  await expect
    .poll(async () => (await mediaState()).unsorted.map((i) => i.songId))
    .toContain(SONGS.lowTide.id);

  // A manually renamed item keeps its name.
  await tile(page, "u2.png").getByTestId("media-name").click();
  await page.getByTestId("media-name-input").fill("keep.png");
  await page.getByTestId("media-name-input").press("Enter");
  await expect(tile(page, "keep.png")).toBeVisible();
  await tile(page, "keep.png").getByTestId("media-open").click();
  await page.getByTestId("viewer-position").waitFor();
  await page.getByRole("button", { name: "Link to song" }).click();
  await page.getByTestId("song-pick-row").first().click();
  await expect(page.getByTestId("viewer-song")).toHaveText(SONGS.lowTide.title);
  await expect(tile(page, "keep.png")).toBeVisible();
  await page.getByRole("button", { name: "Clear song" }).click();
  await expect(page.getByTestId("viewer-song")).toHaveCount(0);
});

test("a file removed from Drive shows the missing placeholder", async ({
  page,
}) => {
  const doomed = (await m.fake.byName("u2.png"))!;
  await m.fake.external({ action: "delete", fileId: doomed.id });
  await m.fake.poll();
  await openGallery(page, m.gigId);
  await expect(page.getByTestId("media-missing")).toContainText(
    "No longer in Drive",
  );
});
