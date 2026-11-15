import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { fakeGoogleConsent } from "./google-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("non-admins do not see band settings", async ({
  page,
  loginAs,
  context,
}) => {
  await context.clearCookies();
  await loginAs(USERS.ben.email);
  await page.goto("/settings?tab=band");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("settings-leave")).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page.getByTestId("settings-spotify")).toBeVisible();
  await expect(page.getByTestId("settings-google")).toHaveCount(0);
});

test("create a new Drive folder named after the band and see its name in settings", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await fakeGoogleConsent(page);
  await page.goto(`/gigs/${gig.id}`);
  const drawer = page.getByRole("dialog", { name: gig.title });
  await drawer.getByRole("button", { name: "Link Google Drive" }).click();

  const picker = page.getByTestId("drive-picker");
  const input = picker.getByLabel("New folder");
  await expect(input).toHaveValue("The Night Owls");
  await input.fill("Gig photos");
  await picker.getByRole("button", { name: "Create" }).click();
  await picker.getByRole("button", { name: "Confirm" }).click();
  await expect(picker).toBeHidden();

  await page.goto("/settings?tab=connections");
  await expect(page.getByTestId("settings-google-drive-detail")).toHaveText(
    "Folder: Gig photos",
  );
});

test("link Drive from a gig drawer, pick a folder, manage it in settings", async ({
  page,
}) => {
  const gig = seed.gigs.upcomingClub;
  await fakeGoogleConsent(page);
  await page.goto(`/gigs/${gig.id}`);
  const drawer = page.getByRole("dialog", { name: gig.title });
  const prompt = drawer.getByTestId("drive-link-prompt");
  await expect(prompt).toContainText(
    "This band hasn't been linked to a Google Drive yet",
  );
  await prompt.getByRole("button", { name: "Link Google Drive" }).click();

  const picker = page.getByTestId("drive-picker");
  await expect(
    picker.getByRole("button", { name: "Band stuff" }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Greenroom demo" }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Band stuff" }).click();
  await picker.getByRole("button", { name: "Confirm" }).click();
  await expect(picker).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/gigs/(.*-)?${gig.id}$`));
  await expect(drawer.getByTestId("media-add")).toHaveText("Add media");

  await page.goto("/settings?tab=connections");
  const status = page.getByTestId("settings-google-drive-status");
  await expect(status).toHaveText("Linked as band@example.com");
  await expect(page.getByTestId("settings-google-drive-detail")).toHaveText(
    "Folder: Band stuff",
  );
  await expect(page.getByRole("link", { name: "Open in Drive" })).toBeVisible();

  await page
    .getByTestId("settings-google-drive")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(status).toHaveText("Not linked");
});
