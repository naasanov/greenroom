import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { CORRUPT_HEIC, HEIC, uploadGigFile } from "./heic-helpers.js";
import {
  openGallery,
  seedGigMedia,
  tile,
  type MediaSeed,
} from "./media-gallery-helpers.js";

test.skip(
  ({ isMobile }) => isMobile,
  "Viewer layout is covered on mobile elsewhere",
);

let m: MediaSeed;

test.beforeEach(async ({ testApi, loginAs }) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, {});
});

test("a converted HEIC renders as an image in the viewer", async ({ page }) => {
  await uploadGigFile(m.ava, HEIC, "IMG_0001.HEIC", "application/octet-stream");
  await openGallery(page, m.gigId);
  await tile(page, "IMG_0001.jpg").getByTestId("media-open").click();
  const img = page.getByTestId("viewer-image");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(451);
  await expect(page.getByTestId("viewer-download-card")).toHaveCount(0);
});

test("a HEIC that could not be converted shows a download card", async ({
  page,
}) => {
  await uploadGigFile(m.ava, CORRUPT_HEIC, "bad.heic", "image/heic");
  await openGallery(page, m.gigId);
  await tile(page, "bad.heic").getByTestId("media-open").click();
  const card = page.getByTestId("viewer-download-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("viewer-image")).toHaveCount(0);
  await expect(
    card.getByRole("link", { name: "Open / Download" }),
  ).toHaveAttribute("href", /\/content\?download=1$/);
});

test("the Files viewer offers a download for an unconverted HEIC", async ({
  page,
}) => {
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  await m.fake.external({
    action: "add",
    name: "left.heic",
    parentId: root.folder.id,
    mimeType: "image/heic",
    contentBase64: CORRUPT_HEIC.toString("base64"),
  });
  await page.goto("/files");
  await page.getByRole("button", { name: "Open left.heic" }).click();
  const viewer = page.getByRole("dialog", { name: "left.heic" });
  await expect(
    viewer.getByText("No preview for this file type."),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Download", exact: true }).last(),
  ).toBeVisible();
  await expect(viewer.getByTestId("viewer-image")).toHaveCount(0);
});
