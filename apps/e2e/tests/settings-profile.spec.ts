import { USERS, bands, users } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";

test("member edits their name and instruments", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.dev.email);
  await page.goto("/settings");
  const save = page.getByRole("button", { name: "Save profile" });
  await expect(save).toBeDisabled();

  const name = page.getByLabel("Your name");
  await name.fill("");
  await save.click();
  await expect(page.getByText("Enter the name your bandmates")).toBeVisible();

  await name.fill("Dev Deluxe");
  await expect(page.getByRole("button", { name: "Drums" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Guitar" }).click();
  await page.getByLabel("Custom instrument").fill("Cowbell");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await save.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("settings-name")).toHaveText("Dev Deluxe");

  const row = (
    await db.select().from(users).where(eq(users.id, USERS.dev.id))
  )[0];
  expect(row?.displayName).toBe("Dev Deluxe");

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await page.goto("/roster");
  const mine = page
    .getByTestId("member-card")
    .filter({ hasText: "Dev Deluxe" });
  await expect(mine).toContainText("Drums, Guitar, Cowbell");
});

test("band section is hidden for regular members", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-personal")).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
  await expect(page.getByTestId("settings-leave")).toBeVisible();
});

test("admin edits the band name and public profile", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  const seeded = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  const band = page.getByTestId("settings-band");
  await expect(band.getByLabel("Bio")).toHaveValue(/rehearsal room/);
  const save = band.getByRole("button", { name: "Save band" });
  await expect(save).toBeDisabled();

  await band.getByLabel("Booking email").fill("not-an-email");
  await band.getByLabel("Instagram").fill("not a link");
  await save.click();
  await expect(band.getByText("Enter a valid email")).toBeVisible();
  await expect(band.getByText("Enter a valid link")).toBeVisible();

  await band.getByLabel("Band name", { exact: true }).fill("The Night Hawks");
  await band.getByLabel("Bio").fill("Loud on weekends.");
  await band.getByLabel("Booking email").fill("book@hawks.test");
  await band.getByLabel("Instagram").fill("instagram.com/hawks");
  await band.getByLabel("YouTube").fill("https://youtube.com/@hawks");
  await save.click();
  await expect(band.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("settings-band-name")).toHaveText(
    "The Night Hawks",
  );

  const row = (
    await db.select().from(bands).where(eq(bands.id, seeded.bands.nightOwls.id))
  )[0];
  expect(row).toMatchObject({
    name: "The Night Hawks",
    bio: "Loud on weekends.",
    bookingContact: "book@hawks.test",
    socialLinks: {
      instagram: "https://instagram.com/hawks",
      youtube: "https://youtube.com/@hawks",
    },
  });

  await page.reload();
  await expect(
    page.getByTestId("settings-band").getByLabel("Instagram"),
  ).toHaveValue("https://instagram.com/hawks");
});
