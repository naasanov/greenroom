import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { seedGigMedia, type MediaSeed } from "./media-gallery-helpers.js";

let seed: BandSeedResult;
let m: MediaSeed;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, { unsorted: ["u1.png", "u2.png"] });
});

const galleryUrl = () => new RegExp(`/gigs/${m.gigId}/media$`);
const gigUrl = () => new RegExp(`/gigs/${m.gigId}$`);

test("strip grows into the full view and collapses back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/gigs/${m.gigId}`);
  const drawer = page.getByRole("dialog", { name: m.gigTitle }).last();
  await drawer.getByTestId("media-strip").click();
  await expect(page.getByTestId("media-morph")).toHaveCount(1);
  await expect(page).toHaveURL(galleryUrl());
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await expect(page.getByTestId("media-morph")).toHaveCount(0);

  await page.getByTestId("media-close").click();
  await expect(page.getByTestId("media-morph")).toHaveCount(1);
  await expect(page).toHaveURL(gigUrl());
  await expect(page.getByTestId("media-gallery")).toBeHidden();
  await expect(page.getByTestId("media-morph")).toHaveCount(0);
  await expect(drawer).toBeVisible();
});

test("reduced motion skips the morph", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/gigs/${m.gigId}`);
  const drawer = page.getByRole("dialog", { name: m.gigTitle }).last();
  await page.evaluate(() => {
    const w = window as unknown as { __morphSeen: boolean };
    w.__morphSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="media-morph"]'))
        w.__morphSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await drawer.getByTestId("media-strip").click();
  await expect(page).toHaveURL(galleryUrl());
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await page.getByTestId("media-close").click();
  await expect(page).toHaveURL(gigUrl());
  await expect(drawer).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as never as { __morphSeen: boolean }).__morphSeen,
    ),
  ).toBe(false);
});

test("a direct load of the media URL does not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/gigs/${m.gigId}/media`);
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await expect(page.getByTestId("media-morph")).toHaveCount(0);
  await page.getByTestId("media-close").click();
  await expect(page).toHaveURL(gigUrl());
  await expect(page.getByTestId("media-morph")).toHaveCount(0);
});
