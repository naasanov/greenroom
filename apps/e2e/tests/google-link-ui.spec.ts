import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { fakeGoogleConsent } from "./google-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("calendar banner can be dismissed and stays dismissed", async ({
  page,
}) => {
  await page.goto("/events");
  const banner = page.getByTestId("calendar-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("events-tab")).toBeVisible();
  await expect(banner).toBeHidden();
});

test("sync calendar from the banner, then manage it in settings", async ({
  page,
}) => {
  await page.goto("/events");
  await page
    .getByTestId("calendar-banner")
    .getByRole("button", { name: "Sync" })
    .click();
  const setup = page.getByTestId("calendar-setup");
  await expect(setup.getByText("Your band calendar is ready.")).toBeVisible();
  await setup.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByTestId("calendar-banner")).toBeHidden();

  await page.goto("/settings");
  const row = page.getByTestId("settings-google-calendar");
  await expect(page.getByTestId("settings-google-calendar-status")).toHaveText(
    "Syncing with Google Calendar",
  );
  await expect(row.getByText(/Last synced/)).toBeVisible();

  await row.getByRole("button", { name: "Disconnect" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(page.getByTestId("settings-google-calendar-status")).toHaveText(
    "Not synced",
  );
});

test("sync calendar from settings without any Google sign-in", async ({
  page,
}) => {
  await page.goto("/settings");
  const row = page.getByTestId("settings-google-calendar");
  await expect(page.getByTestId("settings-google-calendar-status")).toHaveText(
    "Not synced",
  );
  await row.getByRole("button", { name: "Sync to Google Calendar" }).click();
  const setup = page.getByTestId("calendar-setup");
  await expect(setup.getByText("Your band calendar is ready.")).toBeVisible();
  await setup.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("settings-google-calendar-status")).toHaveText(
    "Syncing with Google Calendar",
  );
});

test("non-admins do not see band settings", async ({
  page,
  loginAs,
  context,
}) => {
  await context.clearCookies();
  await loginAs(USERS.ben.email);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
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
  await expect(picker).toBeHidden();

  await page.goto("/settings");
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
  await expect(picker).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gig.id}$`));
  await expect(drawer.getByTestId("media-empty")).toHaveText("No media yet");

  await page.goto("/settings");
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
