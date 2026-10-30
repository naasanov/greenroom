import { BANDS, USERS, bands, gigs } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { AVA, isoDay } from "./events-helpers.js";

const tokenOf = (url: string) => url.split("/c/")[1]!;

async function adminLink(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  const row = page.getByTestId("public-calendar-row");
  const input = row.getByLabel("Public calendar link");
  await expect(input).toHaveValue(/\/c\//);
  return { row, input, url: await input.inputValue() };
}

test("admin copies and resets the public link; the old link stops working", async ({
  page,
  browser,
  testApi,
  loginAs,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (t: string) => {
          (window as unknown as { __copied: string }).__copied = t;
          return Promise.resolve();
        },
      },
    });
  });
  await testApi.seed("band");
  await loginAs(AVA);
  const { row, url } = await adminLink(page);

  await row.getByRole("button", { name: "Copy link" }).click();
  await expect(row.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __copied: string }).__copied,
    ),
  ).toBe(url);

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(new URL(`/c/${tokenOf(url)}`, page.url()).href);
  await expect(
    pub.getByRole("heading", { name: "The Night Owls" }),
  ).toBeVisible();

  await row.getByRole("button", { name: "Reset link" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reset link" })
    .click();
  await expect(row.getByLabel("Public calendar link")).not.toHaveValue(url);

  await pub.reload();
  await expect(pub.getByTestId("public-calendar-unavailable")).toBeVisible();
  await anon.close();
});

test("members do not see the public link settings", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.dev.email);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-personal")).toBeVisible();
  await expect(page.getByTestId("public-calendar-row")).toHaveCount(0);
});

test("gig form toggle is on by default and hides the gig from the public page", async ({
  page,
  browser,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  await loginAs(AVA);
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByTestId("split-pick-right").click();
  const pane = page.getByTestId("split-right");
  const toggle = pane.getByRole("switch", { name: "Show on public calendar" });
  await expect(toggle).toBeChecked();
  await pane.getByLabel("Title").fill("Secret Rehearsal Gig");
  await pane.getByLabel("Date", { exact: true }).fill(isoDay(3));
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await pane.getByRole("button", { name: "Create gig" }).click();
  await expect(page).toHaveURL(/\/gigs\/[0-9a-f-]+$/);

  const rows = await db
    .select()
    .from(gigs)
    .where(eq(gigs.title, "Secret Rehearsal Gig"));
  expect(rows[0]?.showOnPublicCalendar).toBe(false);

  const { url } = await adminLink(page);
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(new URL(`/c/${tokenOf(url)}`, page.url()).href);
  await expect(
    pub.getByTestId("public-gig").filter({ hasText: "Club Meridian" }),
  ).toBeVisible();
  await expect(pub.getByText("Secret Rehearsal Gig")).toHaveCount(0);
  await anon.close();
});

test("public page shows the profile, list and calendar views, no private data", async ({
  page,
  browser,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  await db
    .update(bands)
    .set({
      bookingContact: "book@owls.test",
      socialLinks: { instagram: "https://instagram.com/owls" },
    })
    .where(eq(bands.id, BANDS.nightOwls.id));
  await loginAs(AVA);
  const { url } = await adminLink(page);

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(new URL(`/c/${tokenOf(url)}`, page.url()).href);
  await expect(
    pub.getByRole("heading", { name: "The Night Owls" }),
  ).toBeVisible();
  await expect(pub.getByText(/rehearsal room/)).toBeVisible();
  await expect(pub.getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    "https://instagram.com/owls",
  );
  await expect(pub.getByRole("link", { name: /Book us/ })).toHaveAttribute(
    "href",
    "mailto:book@owls.test",
  );

  const list = pub.getByTestId("public-calendar-list");
  await expect(list.getByTestId("public-gig")).toHaveCount(2);
  await expect(list).toContainText("Club Meridian");
  await expect(list).toContainText("8:00 PM");
  await expect(list).toContainText("Maybe Brewery Night");
  for (const hidden of [
    "Private Party",
    "Rusty Anchor",
    "Pat Promoter",
    "88 Main St",
    "Side Project",
  ]) {
    await expect(pub.getByText(hidden)).toHaveCount(0);
  }

  await pub.getByRole("button", { name: "Calendar" }).click();
  await expect(pub.getByTestId("public-calendar-month")).toBeVisible();
  await expect(
    pub.getByTestId("public-calendar-month").locator("[data-has-show]").first(),
  ).toBeVisible();
  await expect(pub.getByTestId("public-gig").first()).toBeVisible();
  await pub.getByRole("button", { name: "List" }).click();
  await expect(pub.getByTestId("public-calendar-list")).toBeVisible();
  await anon.close();
});
