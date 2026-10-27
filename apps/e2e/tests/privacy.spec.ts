import { WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test("privacy policy is public", async ({ page }) => {
  const res = await page.goto(`${WEB_URL}/privacy`);
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy Policy", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("including the Limited Use requirements"),
  ).toBeVisible();
});
