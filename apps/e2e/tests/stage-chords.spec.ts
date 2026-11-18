import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test.setTimeout(90_000);

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs, playwright }) => {
  seed = await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const bandId = seed.bands.nightOwls.id;
  const api = await playwright.request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  const res = await api.put(
    `/bands/${bandId}/chords/songs/${seed.songs.skyline.id}`,
    { data: { text: "[Verse]\nG       C\nHello world" } },
  );
  expect(res.status(), await res.text()).toBe(200);
  await api.dispose();
});

const title = (page: Page) => page.getByTestId("stage-title");
const position = (page: Page) => page.getByTestId("stage-position");
const reader = (page: Page) => page.getByTestId("chords-reader");

async function openStage(page: Page) {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  await page.getByRole("link", { name: "Stage mode" }).click();
  await expect(title(page)).toHaveText("Skyline Drive", {
    timeout: 30_000,
  });
}

test("shows the sheet for a song with chords and none for one without", async ({
  page,
  isMobile,
}) => {
  await openStage(page);
  await expect(reader(page)).toBeVisible();
  await expect(reader(page)).toContainText("Hello");
  await expect(reader(page)).toContainText("G");

  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Midnight Train");
  await expect(reader(page)).toHaveCount(0);

  await page.keyboard.press("ArrowLeft");
  await expect(reader(page)).toBeVisible();

  test.skip(isMobile, "Mouse drag swipe; touch swipes are not emulated here");
  // Tapping the sheet or a control never navigates.
  await reader(page).getByText("Hello").click();
  await page.getByTestId("chords-zoom-in").click();
  await expect(position(page)).toHaveText("1 of 5");

  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.mouse.move(300, 305, { steps: 5 });
  await page.mouse.up();
  await expect(title(page)).toHaveText("Midnight Train");
  await expect(reader(page)).toHaveCount(0);
});

test("the cached sheet renders with no connection", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "Service worker offline is verified on desktop only");
  await openStage(page);
  await expect(reader(page)).toBeVisible();
  await expect(page.getByTestId("stage-offline")).toHaveText(
    "Available offline",
    { timeout: 20_000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(title(page)).toHaveText("Skyline Drive");
  await expect(reader(page)).toContainText("Hello");
  await context.setOffline(false);
});
