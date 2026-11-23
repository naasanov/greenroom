import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { seedGigMedia, type MediaSeed } from "./media-gallery-helpers.js";

let seed: BandSeedResult;
let m: MediaSeed;
let rootId: string;
let chartId: string;
let planId: string;

const row = (page: Page, name: string) =>
  page.locator(`[data-testid="file-row"][data-name="${name}"]:visible`);

async function openMenu(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: `Actions for ${name}` });
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();
}

const driveHref = (id: string) =>
  `https://drive.google.com/open?id=${encodeURIComponent(id)}`;

async function songFileNames(songId: string) {
  const res = await m.ava.get(`/bands/${BAND}/songs/${songId}/files`);
  const files = (await res.json()) as { name: string }[];
  return files.map((f) => f.name).sort();
}

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, { unsorted: ["u1.png"] });
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  rootId = root.folder.id;
  await m.fake.external({
    action: "folder",
    name: "Rehearsal Notes",
    parentId: rootId,
  });
  const plan = await m.fake.external({
    action: "add",
    name: "stage-plot.png",
    parentId: rootId,
    mimeType: "image/png",
    content: "png",
  });
  planId = plan.id;
  const chart = await m.fake.external({
    action: "add",
    name: "chart.txt",
    parentId: rootId,
    mimeType: "text/plain",
    content: "chart",
  });
  chartId = chart.id;
});

test("every item's menu opens it in Drive in a new tab", async ({ page }) => {
  const doc = await m.fake.external({
    action: "add",
    name: "Set notes",
    parentId: rootId,
    mimeType: "application/vnd.google-apps.document",
    content: "doc",
  });
  await page.goto("/files");
  const targets: [string, string][] = [
    ["chart.txt", chartId],
    ["stage-plot.png", planId],
    ["Set notes", doc.id],
  ];
  for (const [name, id] of targets) {
    await openMenu(page, name);
    const item = page.getByRole("menuitem", { name: "Open in Drive" });
    await expect(item).toHaveAttribute("href", driveHref(id));
    await expect(item).toHaveAttribute("target", "_blank");
    await expect(item).toHaveAttribute("rel", /noopener/);
    await page.keyboard.press("Escape");
    await expect(item).toBeHidden();
  }
  for (const name of ["Rehearsal Notes", "Gigs"]) {
    await openMenu(page, name);
    await expect(
      page.getByRole("menuitem", { name: "Open in Drive" }),
    ).toHaveAttribute("href", /^https:\/\/drive\.google\.com\/open\?id=/);
    await page.keyboard.press("Escape");
  }
});

test("the viewer header has an Open in Drive link", async ({ page }) => {
  await page.goto("/files");
  await page.getByRole("button", { name: "Open stage-plot.png" }).click();
  const viewer = page.getByRole("dialog", { name: "stage-plot.png" });
  const link = viewer.getByRole("link", { name: "Open in Drive" });
  await expect(link).toHaveAttribute("href", driveHref(planId));
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("the Link to songs drawer focuses its search field", async ({ page }) => {
  await page.goto("/files");
  await openMenu(page, "chart.txt");
  await page.getByRole("menuitem", { name: "Link to songs" }).click();
  const drawer = page.getByRole("dialog", { name: "Link to songs" });
  await expect(
    drawer.getByRole("textbox", { name: "Search songs" }),
  ).toBeFocused();
});

test("selection mode links songs to every selected file and keeps existing links", async ({
  page,
}) => {
  const put = await m.ava.put(`/bands/${BAND}/files/items/${chartId}/songs`, {
    data: { songIds: [SONGS.skyline.id] },
  });
  expect(put.ok()).toBe(true);
  await page.goto("/files");
  await page.getByRole("button", { name: "Select items" }).click();
  await page.getByRole("button", { name: "Select chart.txt" }).click();
  await page.getByRole("button", { name: "Select stage-plot.png" }).click();
  await page
    .getByTestId("selection-bar")
    .getByRole("button", { name: "Link to songs" })
    .click();

  const drawer = page.getByRole("dialog", { name: "Link to songs" });
  await expect(
    drawer.getByRole("textbox", { name: "Search songs" }),
  ).toBeFocused();
  await expect(drawer.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await drawer.getByRole("checkbox", { name: /Paper Planes/ }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId("files-toast")).toContainText(
    "Linked 1 song to 2 items",
  );

  expect(await songFileNames(SONGS.paperPlanes.id)).toEqual([
    "chart.txt",
    "stage-plot.png",
  ]);
  expect(await songFileNames(SONGS.skyline.id)).toEqual(["chart.txt"]);
  await expect(
    row(page, "chart.txt").getByTestId("file-song-chip"),
  ).toHaveCount(2);
  await expect(page.getByTestId("selection-count")).toHaveText("0");
});
