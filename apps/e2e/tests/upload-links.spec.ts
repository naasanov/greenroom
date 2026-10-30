import { USERS, publicUploadLinks } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { BAND, PNG, clientFor, setupDrive } from "./api-media-helpers.js";

// Route stubs do not apply reliably to pages controlled by a service worker.
test.use({ serviceWorkers: "block" });

test.skip(({ isMobile }) => isMobile, "Chromium only on this machine");

const SHOTS = process.env.UPLOAD_LINK_SHOTS;
async function shot(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  if (!SHOTS) return;
  for (const [tag, size] of [
    ["desktop", { width: 1280, height: 800 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(size);
    await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("admin creates and copies an upload link from the gig drawer", async ({
  page,
  context,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  await setupDrive(ava);
  await loginAs(USERS.ava.email);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const gig = seed.gigs.upcomingClub;

  await page.goto(`/gigs/${gig.id}`);
  await page.getByTestId("share-upload-link").click();
  const dialog = page.getByTestId("upload-link-dialog");
  await dialog.getByRole("button", { name: "30 days" }).click();
  await shot(page, "dialog-create");
  await dialog.getByTestId("create-upload-link").click();
  const url = dialog.getByTestId("upload-link-url");
  await expect(url).toHaveValue(/\/u\/[\w-]{43}$/);
  await expect(dialog).toContainText("Expires");
  await expect(dialog.getByTestId("upload-link-usage")).toHaveText(
    "No uploads yet.",
  );
  await dialog.getByTestId("copy-upload-link").click();
  await expect(dialog.getByTestId("copy-upload-link")).toHaveText(/Copied/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await url.inputValue());
  await shot(page, "dialog-active");

  // Reopening shows the same link; replacing swaps it; revoking asks first.
  await page.keyboard.press("Escape");
  await page.getByTestId("share-upload-link").click();
  await expect(url).toHaveValue(copied);
  await dialog.getByTestId("new-upload-link").click();
  await expect(url).not.toHaveValue(copied);
  const second = await url.inputValue();
  await dialog.getByTestId("revoke-upload-link").click();
  await page.getByRole("button", { name: "Turn off link" }).last().click();
  await expect(dialog.getByTestId("create-upload-link")).toBeVisible();

  const anon = await page.context().browser()!.newContext();
  const pub = await anon.newPage();
  await pub.goto(copied);
  await expect(pub.getByTestId("upload-link-unavailable")).toHaveAttribute(
    "data-reason",
    "revoked",
  );
  await pub.goto(second);
  await expect(pub.getByTestId("upload-link-unavailable")).toHaveAttribute(
    "data-reason",
    "revoked",
  );
  await anon.close();
});

test("an anonymous visitor uploads to the gig's Unsorted", async ({
  page,
  browser,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  await setupDrive(ava);
  const gig = seed.gigs.upcomingClub;
  const link = await (
    await ava.post(`/bands/${BAND}/gigs/${gig.id}/upload-links`, { data: {} })
  ).json();

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let held = 0;
  await pub.route("**/public/upload-links/*/uploads/*", async (route) => {
    if (route.request().method() === "PUT" && held++ >= 1) await gate;
    await route.continue();
  });
  await pub.goto(link.url);
  await expect(pub.getByRole("heading", { level: 1 })).toContainText(
    `Upload your photos and videos from ${gig.title}`,
  );
  await expect(pub.getByText("The Night Owls")).toBeVisible();
  // No navigation into the app.
  await expect(pub.getByRole("link")).toHaveCount(0);
  await pub.getByTestId("uploader-name").fill("Sam from the crowd");
  const input = pub.getByTestId("public-upload-input");
  await input.setInputFiles({
    name: "first.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(pub.getByTestId("upload-row").first()).toHaveAttribute(
    "data-status",
    "done",
  );
  await input.setInputFiles([
    { name: "second.png", mimeType: "image/png", buffer: PNG },
    { name: "notes.pdf", mimeType: "application/pdf", buffer: PNG },
  ]);
  await expect(pub.getByText("Keep this page open")).toBeVisible();
  await expect(pub.getByTestId("upload-row").nth(2)).toContainText(
    "Only photos and videos",
  );
  await shot(pub, "public-uploading");
  release();
  await expect(pub.getByTestId("upload-all-done")).toContainText(
    "2 files uploaded",
  );
  await anon.close();

  await loginAs(USERS.ava.email);
  await page.goto(`/gigs/${gig.id}/media`);
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await expect(page.locator('[data-testid="media-tile"]')).toHaveCount(2);
  await expect(
    page.locator('[data-testid="media-tile"][data-name="first.png"]'),
  ).toBeVisible();
});

test("an expired link shows a friendly page", async ({
  browser,
  testApi,
  db,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  await setupDrive(ava);
  const link = await (
    await ava.post(
      `/bands/${BAND}/gigs/${seed.gigs.upcomingClub.id}/upload-links`,
      { data: {} },
    )
  ).json();
  await db
    .update(publicUploadLinks)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(publicUploadLinks.id, link.id));

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(link.url);
  const box = pub.getByTestId("upload-link-unavailable");
  await expect(box).toHaveAttribute("data-reason", "expired");
  await expect(box).toContainText("expired");
  await expect(pub.getByTestId("public-upload-input")).toHaveCount(0);
  await shot(pub, "expired");

  await pub.goto("/u/not-a-real-link-token-0000000000");
  await expect(pub.getByTestId("upload-link-unavailable")).toHaveAttribute(
    "data-reason",
    "unknown",
  );
  await anon.close();
});
