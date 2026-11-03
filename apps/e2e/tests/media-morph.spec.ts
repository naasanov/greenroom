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
const gigUrl = () => new RegExp(`/gigs/([^/]*-)?${m.gigId}$`);

test("strip opens the full view and close returns to the drawer", async ({
  page,
}) => {
  await page.goto(`/gigs/${m.gigId}`);
  const drawer = page.getByRole("dialog", { name: m.gigTitle }).last();
  await drawer.getByTestId("media-strip").click();
  await expect(page).toHaveURL(galleryUrl());
  await expect(page.getByTestId("media-gallery")).toBeVisible();

  await page.getByTestId("media-close").click();
  await expect(page).toHaveURL(gigUrl());
  await expect(page.getByTestId("media-gallery")).toBeHidden();
  await expect(drawer).toBeVisible();
});

test("a direct load of the media URL closes to the gig", async ({ page }) => {
  await page.goto(`/gigs/${m.gigId}/media`);
  await expect(page.getByTestId("media-gallery")).toBeVisible();
  await page.getByTestId("media-close").click();
  await expect(page).toHaveURL(gigUrl());
});
