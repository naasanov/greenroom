import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

const nav = (page: Page, isMobile: boolean) =>
  page.getByTestId(isMobile ? "bottom-tab-bar" : "top-tabs");

const switcher = (page: Page, name: string) =>
  page.getByRole("button", { name: `Switch band, current: ${name}` });

test("gig link opens Events with the gig drawer and closing returns to Events", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);

  const drawer = page.getByRole("dialog", { name: gig.title });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("8:00 PM");
  await expect(
    nav(page, !!isMobile).getByRole("link", { name: "Events" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("events-tab")).toHaveAttribute(
    "data-focus-date",
    gig.date,
  );

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(drawer).toBeHidden();
});

test("practice link opens the occurrence on that date", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const date = seed.practice.moved.startsAt.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  const drawer = page.getByRole("dialog", { name: seed.practice.title });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Rehearsal room B");
  await expect(page.getByTestId("events-tab")).toHaveAttribute(
    "data-focus-date",
    date,
  );
});

test("practice link on a date with no occurrence shows a message", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  // The occurrence generated for this date was moved a day later.
  const date = seed.practice.moved.originalStart.slice(0, 10);
  await page.goto(`/practices/${seed.practice.seriesId}?date=${date}`);
  await expect(page.getByRole("status")).toContainText("no occurrence");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("events-tab")).toBeVisible();
});

test("song link opens Music Library with the sheet", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto(`/songs/${seed.songs.skyline.id}`);
  const sheet = page.getByTestId("right-sheet");
  await expect(sheet).toContainText("Skyline Drive");
  await expect(sheet).toContainText("The Meridians");
  await expect(
    nav(page, !!isMobile).getByRole("link", { name: "Music Library" }),
  ).toHaveAttribute("aria-current", "page");

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test("a link to the other band switches bands and the choice persists", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/events");
  await expect(switcher(page, "The Night Owls")).toBeVisible();

  await page.goto(`/gigs/${seed.gigs.sideProject.id}`);
  await expect(
    page.getByRole("dialog", { name: seed.gigs.sideProject.title }),
  ).toBeVisible();
  await expect(switcher(page, "Side Project")).toBeVisible();

  await page.goto("/events");
  await expect(switcher(page, "Side Project")).toBeVisible();
});

test("a link to a band the user is not in shows the no-access state", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto(`/gigs/${seed.gigs.sideProject.id}`);
  await expect(
    page.getByText("This link doesn't exist or you don't have access"),
  ).toBeVisible();
  await expect(switcher(page, "The Night Owls")).toBeVisible();
  await page.getByRole("link", { name: "Go to Events" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("signed-out visitors return to the same link after signing in", async ({
  page,
  testApi,
}) => {
  const seed = await testApi.seed("band");
  const date = seed.practice.moved.startsAt.slice(0, 10);
  const target = `/practices/${seed.practice.seriesId}?date=${date}`;
  await page.goto(target);
  await expect(page).toHaveURL(/\/sign-in\?redirectTo=/);

  await page.getByLabel("Email").fill(USERS.ava.email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  let link = "";
  await expect
    .poll(async () => {
      link = (await testApi.magicLinksFor(USERS.ava.email)).at(-1)?.link ?? "";
      return link;
    })
    .toContain("/auth/callback?token=");
  await page.goto(link);
  await expect(page).toHaveURL(`${WEB_URL}${target}`);
  await expect(
    page.getByRole("dialog", { name: seed.practice.title }),
  ).toBeVisible();
});

test("share button in the drawer copies the canonical link", async ({
  page,
  context,
  testApi,
  loginAs,
  browserName,
  isMobile,
}) => {
  test.skip(
    !!isMobile || browserName !== "chromium",
    "clipboard reads are only granted on desktop Chromium",
  );
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: WEB_URL,
  });
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  const drawer = page.getByRole("dialog", { name: gig.title });
  await drawer.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByText("Link copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${WEB_URL}/gigs/${gig.id}`,
  );
});
