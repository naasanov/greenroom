import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { fakeSpotifyConsent } from "./spotify-helpers.js";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("connect and disconnect Spotify from settings", async ({ page }) => {
  await fakeSpotifyConsent(page);
  await page.goto("/settings");
  const status = page.getByTestId("settings-spotify-status");
  await expect(status).toHaveText("Not connected");
  await page.getByRole("button", { name: "Connect Spotify" }).click();
  await expect(status).toHaveText(/^Connected as /);
  await expect(page.getByText("Spotify connected.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByRole("button", { name: "Disconnect" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(status).toHaveText("Not connected");
});

test("a denied login shows an error in settings", async ({ page }) => {
  await fakeSpotifyConsent(page, "deny");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Connect Spotify" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't connect" }),
  ).toBeVisible();
  await expect(page.getByTestId("settings-spotify-status")).toHaveText(
    "Not connected",
  );
  await expect(page).toHaveURL(/\/settings$/);
});
