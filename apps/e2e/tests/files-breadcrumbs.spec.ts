import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { seedGigMedia, type MediaSeed } from "./media-gallery-helpers.js";

// Route stubs cannot intercept requests from a page controlled by the service worker (WebKit).
test.use({ serviceWorkers: "block" });

const LONG = "Rehearsal recordings from the long autumn rehearsal weekend";
const NAMES = ["Archive", "Tour 2027", LONG, "Soundcheck takes", "Final mix"];

let m: MediaSeed;
let ids: string[];

test.beforeEach(async ({ testApi, loginAs }) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, { unsorted: ["u1.png"] });
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  ids = [];
  let parentId: string = root.folder.id;
  for (const name of NAMES) {
    const folder = await m.fake.external({ action: "folder", name, parentId });
    ids.push(folder.id);
    parentId = folder.id;
  }
});

const noHorizontalOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

test("phone keeps the parent visible and lists older ancestors in the menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/files/${ids[4]}`);
  const crumbs = page.getByTestId("files-breadcrumbs");
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Final mix",
  );
  await expect(crumbs.getByRole("link", { name: "Files" })).toBeVisible();
  await expect(
    crumbs.getByRole("link", { name: "Soundcheck takes" }),
  ).toBeVisible();
  for (const hidden of ["Archive", "Tour 2027", LONG]) {
    await expect(crumbs.getByRole("link", { name: hidden })).toBeHidden();
  }
  expect(await noHorizontalOverflow(page)).toBe(true);

  await crumbs.getByRole("button", { name: "Show hidden folders" }).click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveText(["Archive", "Tour 2027", LONG]);
  await items.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/files/${ids[1]}$`));
});

test("phone shows a long parent name truncated without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/files/${ids[3]}`);
  const crumbs = page.getByTestId("files-breadcrumbs");
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Soundcheck takes",
  );
  const parent = crumbs.getByRole("link", { name: LONG });
  await expect(parent).toBeVisible();
  const box = await parent.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await crumbs.getByRole("button", { name: "Show hidden folders" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Archive", "Tour 2027"]);
});

test("phone path with nothing hidden has no overflow menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/files/${ids[1]}`);
  const crumbs = page.getByTestId("files-breadcrumbs");
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Tour 2027",
  );
  await expect(crumbs.getByRole("link", { name: "Archive" })).toBeVisible();
  await expect(
    crumbs.getByRole("button", { name: "Show hidden folders" }),
  ).toBeHidden();
});

test("wide viewport shows every ancestor and no overflow menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/files/${ids[4]}`);
  const crumbs = page.getByTestId("files-breadcrumbs");
  await expect(crumbs.locator('[aria-current="page"]:visible')).toHaveText(
    "Final mix",
  );
  for (const name of ["Files", ...NAMES.slice(0, 4)]) {
    await expect(crumbs.getByRole("link", { name })).toBeVisible();
  }
  await expect(
    crumbs.getByRole("button", { name: "Show hidden folders" }),
  ).toBeHidden();
});
