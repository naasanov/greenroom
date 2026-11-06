import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { seedGigMedia, type MediaSeed } from "./media-gallery-helpers.js";

// Route stubs cannot intercept requests from a page controlled by the service worker (WebKit).
test.use({ serviceWorkers: "block" });

let seed: BandSeedResult;
let m: MediaSeed;
let rootId: string;
let notesId: string;

const nav = (page: Page, isMobile: boolean) =>
  page.getByTestId(isMobile ? "bottom-tab-bar" : "top-tabs");
const row = (page: Page, name: string) =>
  page.locator(`[data-testid="file-row"][data-name="${name}"]:visible`);

async function openMenu(page: Page, name: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
}

/** New menu: a dropdown on desktop, the speed-dial FAB on phones. */
async function newAction(
  page: Page,
  isMobile: boolean,
  action: "folder" | "upload",
) {
  // Next keeps earlier /files pages mounted but hidden, so match the visible copy only.
  await page
    .getByRole("button", { name: "New", exact: true })
    .filter({ visible: true })
    .click();
  if (isMobile) {
    await page
      .getByTestId(
        `fab-action-${action === "folder" ? "new-folder" : "upload"}`,
      )
      .filter({ visible: true })
      .click();
  } else {
    await page
      .getByRole("menuitem", {
        name: action === "folder" ? "New folder" : "Upload files",
      })
      .filter({ visible: true })
      .click();
  }
}

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, { unsorted: ["u1.png"] });
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  rootId = root.folder.id;
  const notes = await m.fake.external({
    action: "folder",
    name: "Rehearsal Notes",
    parentId: rootId,
  });
  notesId = notes.id;
  await m.fake.external({
    action: "folder",
    name: "Old Takes",
    parentId: notesId,
  });
  await m.fake.external({
    action: "add",
    name: "stage-plot.png",
    parentId: rootId,
    mimeType: "image/png",
    content: "png",
  });
  await m.fake.external({
    action: "add",
    name: "chart.txt",
    parentId: rootId,
    mimeType: "text/plain",
    content: "chart",
  });
});

test("Files tab appears in the nav and shows the Drive root", async ({
  page,
  isMobile,
}) => {
  await page.goto("/events");
  await nav(page, !!isMobile).getByRole("link", { name: "Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(
    nav(page, !!isMobile).getByRole("link", { name: "Files" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("files-tab")).toBeVisible();
  await expect(row(page, "Rehearsal Notes")).toBeVisible();
  await expect(row(page, "stage-plot.png")).toBeVisible();
  // Folders sort before files.
  const kinds = await page
    .getByTestId("file-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  expect(kinds.indexOf("file")).toBeGreaterThan(kinds.lastIndexOf("folder"));
  await page.reload();
  await expect(page).toHaveURL(/\/files$/);
  await expect(row(page, "Rehearsal Notes")).toBeVisible();
});

test("breadcrumbs follow entering and leaving folders", async ({ page }) => {
  await page.goto("/files");
  await page.getByRole("link", { name: "Open Rehearsal Notes" }).click();
  await expect(page).toHaveURL(new RegExp(`/files/${notesId}$`));
  const crumbs = page.getByTestId("files-breadcrumbs");
  await expect(crumbs.getByRole("link", { name: "Files" })).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Rehearsal Notes",
  );
  await page.getByRole("link", { name: "Open Old Takes" }).click();
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Old Takes",
  );
  await expect(
    page.getByText("This folder is empty").filter({ visible: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Rehearsal Notes",
  );
  await crumbs.getByRole("link", { name: "Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(row(page, "chart.txt")).toBeVisible();
});

test("creates a folder from the New menu", async ({ page, isMobile }) => {
  await page.goto("/files");
  await newAction(page, !!isMobile, "folder");
  await page.getByRole("textbox", { name: "Name" }).fill("Setlists 2027");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, "Setlists 2027")).toBeVisible();
  expect(await m.fake.byName("Setlists 2027")).toMatchObject({
    parentId: rootId,
  });
});

const textFile = (name: string, body = "hello") => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(body),
});

async function pickFiles(
  page: Page,
  isMobile: boolean,
  files: ReturnType<typeof textFile>[],
) {
  const chooser = page.waitForEvent("filechooser");
  await newAction(page, isMobile, "upload");
  await (await chooser).setFiles(files);
}

test("uploads several files into the root from the picker", async ({
  page,
  isMobile,
}) => {
  await page.goto("/files");
  await expect(row(page, "chart.txt")).toBeVisible();
  await pickFiles(page, !!isMobile, [
    textFile("riff-one.txt"),
    textFile("riff-two.txt", "two"),
  ]);
  await expect(row(page, "riff-one.txt")).toBeVisible();
  await expect(row(page, "riff-two.txt")).toBeVisible();
  expect(await m.fake.byName("riff-one.txt")).toMatchObject({
    parentId: rootId,
  });
});

test("uploads into a nested folder and the file appears in its listing", async ({
  page,
  isMobile,
}) => {
  await page.goto("/files");
  await page.getByRole("link", { name: "Open Rehearsal Notes" }).click();
  await expect(page).toHaveURL(new RegExp(`/files/${notesId}$`));
  await pickFiles(page, !!isMobile, [textFile("nested-take.txt")]);
  await expect(row(page, "nested-take.txt")).toBeVisible();
  expect(await m.fake.byName("nested-take.txt")).toMatchObject({
    parentId: notesId,
  });
});

test("dropping files on a folder row uploads into that folder", async ({
  page,
  isMobile,
}) => {
  test.skip(!!isMobile, "Drag and drop is desktop only");
  await page.goto("/files");
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["drop"], "dropped.txt", { type: "text/plain" }));
    return dt;
  });
  await row(page, "Rehearsal Notes").dispatchEvent("dragover", {
    dataTransfer,
  });
  await row(page, "Rehearsal Notes").dispatchEvent("drop", { dataTransfer });
  await expect
    .poll(async () => (await m.fake.byName("dropped.txt"))?.parentId)
    .toBe(notesId);
  await expect(row(page, "dropped.txt")).toHaveCount(0);
});

test("uploading into a gig folder is not offered and the server refusal shows", async ({
  page,
  isMobile,
}) => {
  await page.goto(`/files/${rootId}`);
  await page.getByRole("link", { name: "Open Gigs" }).click();
  // The gig folder row is not a drop target.
  await expect(row(page, m.gigTitle)).toBeVisible();
  await expect(row(page, m.gigTitle)).not.toHaveAttribute("data-drop-folder");

  await page.goto(`/files/${m.gigFolderId}`);
  await pickFiles(page, !!isMobile, [textFile("nope.txt")]);
  const alert = page.getByTestId("files-upload-errors").getByRole("alert");
  await expect(alert).toContainText("Upload gig files from the gig");
  await alert.getByRole("button", { name: /Dismiss upload/ }).click();
  await expect(alert).toHaveCount(0);
});

test("renames an item", async ({ page }) => {
  await page.goto("/files");
  await openMenu(page, "chart.txt");
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toHaveValue("chart.txt");
  await name.fill("chord-chart.txt");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(row(page, "chord-chart.txt")).toBeVisible();
  await expect(row(page, "chart.txt")).toHaveCount(0);
  expect(await m.fake.byName("chord-chart.txt")).toBeTruthy();
});

test("moves an item to trash after confirming", async ({ page }) => {
  await page.goto("/files");
  await openMenu(page, "chart.txt");
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, "chart.txt")).toBeVisible();

  await openMenu(page, "chart.txt");
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Move to trash" })
    .click();
  await expect(row(page, "chart.txt")).toHaveCount(0);
  expect((await m.fake.byName("chart.txt"))?.trashed).toBe(true);
});

test("selection mode trashes several items", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/files");
  await page.getByRole("button", { name: "Select items" }).click();
  await page.getByRole("button", { name: "Select chart.txt" }).click();
  await page.getByRole("button", { name: "Select stage-plot.png" }).click();
  await expect(page.getByTestId("selection-count")).toHaveText("2");
  await page
    .getByTestId("selection-bar")
    .getByRole("button", { name: "Move to trash" })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Move to trash" })
    .click();
  await expect(row(page, "chart.txt")).toHaveCount(0);
  await expect(row(page, "stage-plot.png")).toHaveCount(0);
  await expect(row(page, "Rehearsal Notes")).toBeVisible();
});

test("gigs root and gig folders look distinct and cannot be trashed", async ({
  page,
}) => {
  await page.goto("/files");
  const gigsRoot = row(page, "Gigs");
  await expect(gigsRoot.getByTestId("gigs-root-icon")).toBeVisible();
  await expect(gigsRoot.getByTestId("gigs-root-badge")).toHaveCount(0);
  await expect(gigsRoot).not.toContainText("Gig folders");
  await expect(
    row(page, "Rehearsal Notes").getByTestId("folder-icon"),
  ).toBeVisible();

  await openMenu(page, "Gigs");
  await expect(
    page.getByRole("menuitem", { name: "Move to trash" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Open Gigs" }).click();
  const gigFolder = row(page, m.gigTitle);
  await expect(gigFolder.getByTestId("gig-folder-icon")).toBeVisible();
  await expect(gigFolder).toContainText("Gig");

  await openMenu(page, m.gigTitle);
  await expect(
    page.getByRole("menuitem", { name: "Move to trash" }),
  ).toBeDisabled();
  await expect(page.getByTestId("trash-locked-hint")).toHaveText(
    "Delete the gig to remove its folder",
  );
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: `Open ${m.gigTitle}` }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${m.gigId}/media$`));
  await expect(page.getByTestId("media-gallery")).toBeVisible();
});

test("folder menu links a plain folder to a gig; protected folders show a blocked trash action", async ({
  page,
}) => {
  const target = seed.gigs.tentative;
  await page.goto("/files");
  await openMenu(page, "stage-plot.png");
  await expect(page.getByRole("menuitem", { name: "Link to gig" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  await openMenu(page, "Rehearsal Notes");
  await page.getByRole("menuitem", { name: "Link to gig" }).click();
  const dialog = page.getByTestId("link-gig-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(target.title) }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("files-toast")).toContainText(
    'Linked "Rehearsal Notes"',
  );
  await expect(row(page, target.title)).toBeVisible();
  await expect(
    row(page, target.title).getByTestId("gig-folder-icon"),
  ).toBeVisible();

  await openMenu(page, "Gigs");
  await expect(page.getByRole("menuitem", { name: "Link to gig" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("menuitem", { name: "Move to trash" }),
  ).toBeDisabled();
  await expect(page.getByTestId("trash-locked-hint")).toBeVisible();
});

test("links a file to songs and shows the chip", async ({ page }) => {
  await page.goto("/files");
  await openMenu(page, "chart.txt");
  await page.getByRole("menuitem", { name: "Link to songs" }).click();
  const drawer = page.getByRole("dialog", { name: "Link to songs" });
  await drawer.getByRole("textbox", { name: "Search songs" }).fill("Skyline");
  await expect(
    drawer.getByRole("checkbox", { name: /Skyline Drive/ }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("checkbox", { name: /Paper Planes/ }),
  ).toHaveCount(0);
  await drawer.getByRole("checkbox", { name: /Skyline Drive/ }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  await expect(row(page, "chart.txt").getByTestId("file-song-chip")).toHaveText(
    SONGS.skyline.title,
  );
});

test("opens a file in the viewer", async ({ page }) => {
  await page.goto("/files");
  await page.getByRole("button", { name: "Open stage-plot.png" }).click();
  const viewer = page.getByRole("dialog", { name: "stage-plot.png" });
  await expect(viewer.getByTestId("viewer-image")).toBeAttached();
  await viewer.getByRole("button", { name: "Close viewer" }).click();
  await expect(viewer).toBeHidden();
});

test("view mode persists across reloads and offers compact previews", async ({
  page,
}) => {
  await page.goto("/files");
  await page.getByRole("radio", { name: "Large previews" }).click();
  await expect(page.getByTestId("files-grid")).toHaveAttribute(
    "data-density",
    "grid",
  );
  await page.getByRole("radio", { name: "Compact previews" }).click();
  await expect(page.getByTestId("files-grid")).toHaveAttribute(
    "data-density",
    "compact",
  );
  await page.reload();
  await expect(page.getByTestId("files-grid")).toHaveAttribute(
    "data-density",
    "compact",
  );
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page.getByTestId("files-list")).toBeVisible();
});

test("a legacy stored grid value opens the large previews grid", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gr-files-view", "grid"));
  await page.goto("/files");
  await expect(page.getByTestId("files-grid")).toHaveAttribute(
    "data-density",
    "grid",
  );
});

test("closing a gig's media page returns to the Files folder", async ({
  page,
}) => {
  await page.goto("/files");
  await page.getByRole("link", { name: "Open Gigs" }).click();
  await expect(row(page, m.gigTitle)).toBeVisible();
  const folderUrl = page.url();
  await page.getByRole("link", { name: `Open ${m.gigTitle}` }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${m.gigId}/media$`));
  await page.getByRole("button", { name: "Back to gig" }).click();
  await expect(page).toHaveURL(folderUrl);
  await expect(row(page, m.gigTitle)).toBeVisible();
});

test("an unlinked band sees the Drive link prompt", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.reset();
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/files");
  await expect(page.getByTestId("drive-link-prompt")).toBeVisible();
  await expect(page.getByTestId("file-row")).toHaveCount(0);
});
