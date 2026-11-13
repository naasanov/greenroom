import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { fakeGoogleConsent } from "./google-helpers.js";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("settings tabs switch and sync the URL", async ({ page }) => {
  await page.goto("/settings");
  const tab = (name: string) => page.getByRole("tab", { name });
  await expect(tab("Profile")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "settings-tab-profile",
  );
  await expect(page.getByTestId("settings-personal")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete account" }),
  ).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);

  await tab("Band").click();
  await expect(page).toHaveURL(/\/settings\?tab=band$/);
  await expect(tab("Band")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("settings-band")).toBeVisible();
  await expect(page.getByTestId("public-calendar-row")).toBeVisible();
  await expect(page.getByTestId("settings-leave")).toBeVisible();
  await expect(page.getByTestId("settings-personal")).toHaveCount(0);

  await tab("Connections").click();
  await expect(page).toHaveURL(/\/settings\?tab=connections$/);
  await expect(page.getByTestId("settings-spotify")).toBeVisible();
  await expect(page.getByTestId("settings-google-drive")).toBeVisible();
  await expect(page.getByTestId("settings-leave")).toHaveCount(0);

  await tab("Profile").click();
  await expect(page.getByTestId("settings-personal")).toBeVisible();
});

test("a ?tab= deep link opens that tab", async ({ page }) => {
  await page.goto("/settings?tab=connections");
  await expect(page.getByRole("tab", { name: "Connections" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("settings-google-drive")).toBeVisible();
});

test("returning from Google lands on Connections with the Drive picker", async ({
  page,
}) => {
  await fakeGoogleConsent(page);
  await page.goto("/settings?tab=connections");
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByTestId("drive-picker")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?tab=connections$/);
  await expect(
    page.getByRole("tab", { name: "Connections", includeHidden: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a denied Google sign-in shows the error on Connections", async ({
  page,
}) => {
  await fakeGoogleConsent(page, "deny");
  await page.goto("/settings?tab=connections");
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "cancelled",
  );
  await expect(page).toHaveURL(/\/settings\?tab=connections$/);
});

test("members see only Leave band on Band and no Drive card", async ({
  page,
  loginAs,
  context,
}) => {
  await context.clearCookies();
  await loginAs(USERS.ben.email);
  await page.goto("/settings?tab=band");
  await expect(page.getByTestId("settings-leave")).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page.getByTestId("settings-spotify")).toBeVisible();
  await expect(page.getByTestId("settings-google-drive")).toHaveCount(0);
});
