import { BANDS, USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND, PNG, clientFor, setupDrive } from "./api-media-helpers.js";

type Page = import("@playwright/test").Page;

const png = (name = "photo.png") => ({
  name,
  mimeType: "image/png",
  buffer: PNG,
});
const switcherImg = (page: Page) =>
  page.locator('button[aria-label^="Switch band"]:visible img');
const card = (page: Page, name: string) =>
  page.getByTestId("member-card").filter({ hasText: name });

test("photo rows are disabled with a note until Drive is set up", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  const mine = page.getByTestId("member-photo-row");
  await expect(mine).toContainText("Your photo in The Night Owls");
  await expect(mine.getByTestId("member-photo-row-note")).toHaveText(
    "Link Google Drive in Band settings to add photos",
  );
  await expect(mine.getByRole("button", { name: "Add photo" })).toBeDisabled();
  const band = page.getByTestId("band-photo-row");
  await expect(band.getByTestId("band-photo-row-note")).toBeVisible();
  await expect(band.getByRole("button", { name: "Add photo" })).toBeDisabled();
});

test("admin uploads, replaces, and removes the band photo", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await setupDrive(await clientFor(testApi, USERS.ava.email));
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  const row = page.getByTestId("band-photo-row");
  await expect(row.getByRole("button", { name: "Add photo" })).toBeEnabled();
  await expect(switcherImg(page)).toHaveCount(0);

  await row.getByTestId("band-photo-row-input").setInputFiles(png());
  await expect(
    row.getByRole("button", { name: "Replace photo" }),
  ).toBeVisible();
  await expect(switcherImg(page)).toHaveAttribute(
    "src",
    new RegExp(`/bands/${BAND}/photo\\?v=`),
  );
  const first = await switcherImg(page).getAttribute("src");

  await row.getByTestId("band-photo-row-input").setInputFiles(png("two.png"));
  await expect
    .poll(async () => switcherImg(page).getAttribute("src"))
    .not.toBe(first);

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row.getByRole("button", { name: "Add photo" })).toBeVisible();
  await expect(switcherImg(page)).toHaveCount(0);
});

test("a member photo shows for this band only, and removing falls back to initials", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await setupDrive(await clientFor(testApi, USERS.ava.email));
  await loginAs(USERS.ben.email);
  const api = await clientFor(testApi, USERS.ben.email);
  expect(
    (
      await api.put("/me/current-band", {
        data: { bandId: BANDS.nightOwls.id },
      })
    ).status(),
  ).toBeLessThan(300);

  await page.goto("/settings");
  const row = page.getByTestId("member-photo-row");
  await row.getByTestId("member-photo-row-input").setInputFiles(png());
  await expect(
    row.getByRole("button", { name: "Replace photo" }),
  ).toBeVisible();
  await expect(row.locator("img")).toHaveAttribute(
    "src",
    new RegExp(`/bands/${BANDS.nightOwls.id}/members/${USERS.ben.id}/photo`),
  );

  await page.goto("/roster");
  const ben = card(page, USERS.ben.displayName);
  await expect(ben.locator("img")).toHaveAttribute(
    "src",
    /members\/.+\/photo\?v=/,
  );
  await ben.getByRole("button").first().click();
  const sheet = page.getByRole("dialog", { name: USERS.ben.displayName });
  await expect(sheet.locator("img")).toHaveAttribute("src", /photo\?v=/);
  await page.keyboard.press("Escape");

  // The other band's roster shows no photo for Ben.
  const other = await api.get(
    `/bands/${BANDS.sideProject.id}/members/${USERS.ben.id}/photo`,
  );
  expect(other.status()).toBe(404);
  const members = await (
    await api.get(`/bands/${BANDS.sideProject.id}/members`)
  ).json();
  expect(
    members.find((m: { userId: string }) => m.userId === USERS.ben.id).photoUrl,
  ).toBeNull();

  await page.goto("/settings");
  await page
    .getByTestId("member-photo-row")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(
    page.getByTestId("member-photo-row").getByRole("button", {
      name: "Add photo",
    }),
  ).toBeVisible();
  await page.goto("/roster");
  await expect(card(page, USERS.ben.displayName).locator("img")).toHaveCount(0);
  await expect(card(page, USERS.ben.displayName)).toContainText("B");
});

test("too-large and non-image files show friendly errors", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await setupDrive(await clientFor(testApi, USERS.ava.email));
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  const row = page.getByTestId("member-photo-row");
  await row.getByTestId("member-photo-row-input").setInputFiles({
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(row.getByRole("alert")).toContainText("over 10 MB");
  await row.getByTestId("member-photo-row-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(row.getByRole("alert")).toContainText("not a photo");
  await expect(row.getByRole("button", { name: "Add photo" })).toBeVisible();
});

test("non-admins cannot change the band photo", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await setupDrive(await clientFor(testApi, USERS.ava.email));
  const cleo = await clientFor(testApi, USERS.cleo.email);
  const res = await cleo.put(`/bands/${BAND}/photo`, {
    multipart: { photo: png() },
  });
  expect(res.status()).toBe(403);
  expect((await cleo.delete(`/bands/${BAND}/photo`)).status()).toBe(403);

  await loginAs(USERS.cleo.email);
  await page.goto("/settings");
  await expect(page.getByTestId("member-photo-row")).toBeVisible();
  await expect(page.getByTestId("band-photo-row")).toHaveCount(0);
});
