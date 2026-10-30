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

test("settings shows one profile photo; the band photo is disabled until Drive is set up", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  const mine = page.getByTestId("profile-photo-row");
  await expect(mine).toContainText("Your photo");
  await expect(page.getByTestId("member-photo-row")).toHaveCount(0);
  await expect(mine.getByRole("button", { name: "Add photo" })).toBeEnabled();
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

test("the profile photo shows everywhere, and removing falls back to initials", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  const api = await clientFor(testApi, USERS.ben.email);

  await page.goto("/settings");
  const row = page.getByTestId("profile-photo-row");
  await row.getByTestId("profile-photo-row-input").setInputFiles(png());
  await expect(
    row.getByRole("button", { name: "Replace photo" }),
  ).toBeVisible();
  await expect(row.locator("img")).toHaveAttribute(
    "src",
    new RegExp(`/users/${USERS.ben.id}/photo\\?v=`),
  );

  await page.goto("/roster");
  const ben = card(page, USERS.ben.displayName);
  await expect(ben.locator("img")).toHaveAttribute(
    "src",
    new RegExp(`/users/${USERS.ben.id}/photo`),
  );

  // The same photo appears in every band the user belongs to.
  const other = await (
    await api.get(`/bands/${BANDS.sideProject.id}/members`)
  ).json();
  const me = other.find((m: { userId: string }) => m.userId === USERS.ben.id);
  if (me) expect(me.avatarUrl).toContain(`/users/${USERS.ben.id}/photo`);

  await page.goto("/settings");
  await page
    .getByTestId("profile-photo-row")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(
    page.getByTestId("profile-photo-row").getByRole("button", {
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
  const row = page.getByTestId("profile-photo-row");
  await row.getByTestId("profile-photo-row-input").setInputFiles({
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(row.getByRole("alert")).toContainText("over 10 MB");
  await row.getByTestId("profile-photo-row-input").setInputFiles({
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
  await expect(page.getByTestId("profile-photo-row")).toBeVisible();
  await expect(page.getByTestId("band-photo-row")).toHaveCount(0);
});

test("a rotated phone photo is uploaded upright", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/settings");

  // 60x20 JPEG, red left half, blue right half, tagged EXIF orientation 6 (rotate 90 cw).
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 20;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f00";
    g.fillRect(0, 0, 30, 20);
    g.fillStyle = "#00f";
    g.fillRect(30, 0, 30, 20);
    const blob = await new Promise<Blob>((r) =>
      c.toBlob((b) => r(b!), "image/jpeg", 0.95),
    );
    const jpg = new Uint8Array(await blob.arrayBuffer());
    const exif = new Uint8Array([
      0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d,
      0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const out = new Uint8Array(jpg.length + exif.length);
    out.set(jpg.subarray(0, 2));
    out.set(exif, 2);
    out.set(jpg.subarray(2), 2 + exif.length);
    let s = "";
    for (const b of out) s += String.fromCharCode(b);
    return btoa(s);
  });

  // Capture the uploaded file from the outgoing multipart body.
  await page.evaluate(() => {
    const w = window as unknown as { __sent?: Blob };
    const orig = window.fetch;
    window.fetch = (input, init) => {
      const body = init?.body;
      if (body instanceof FormData) w.__sent = body.get("photo") as Blob;
      return orig(input, init);
    };
  });
  const row = page.getByTestId("profile-photo-row");
  await row.getByTestId("profile-photo-row-input").setInputFiles({
    name: "phone.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(b64, "base64"),
  });
  await expect(
    row.getByRole("button", { name: "Replace photo" }),
  ).toBeVisible();

  // Upright means the top of the square is red and the bottom is blue.
  const [top, bottom] = await page.evaluate(async () => {
    const sent = (window as unknown as { __sent: Blob }).__sent;
    const img = await createImageBitmap(sent);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const px = (y: number) =>
      Array.from(g.getImageData(Math.floor(img.width / 2), y, 1, 1).data);
    return [px(2), px(img.height - 3)];
  });
  expect(top![0]).toBeGreaterThan(top![2] + 80);
  expect(bottom![2]).toBeGreaterThan(bottom![0] + 80);
});
