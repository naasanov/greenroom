import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

const title = (page: Page) => page.getByTestId("stage-title");
const position = (page: Page) => page.getByTestId("stage-position");

async function openStage(page: Page) {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  await page.getByRole("link", { name: "Stage mode" }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gig.id}/stage$`));
  await expect(title(page)).toHaveText("Skyline Drive");
}

test("opens from a gig with title, next song and position", async ({
  page,
}) => {
  await openStage(page);
  await expect(position(page)).toHaveText("1 of 5");
  await expect(page.getByTestId("stage-next")).toContainText("Midnight Train");
  await expect(page.getByTestId("stage-view")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
});

test("tap advances, arrow goes back, notes show under the title", async ({
  page,
}) => {
  await openStage(page);
  const view = page.getByTestId("stage-view");
  await view.click({ position: { x: 200, y: 300 } });
  await expect(title(page)).toHaveText("Midnight Train");
  await expect(position(page)).toHaveText("2 of 5");
  await view.click({ position: { x: 200, y: 300 } });
  await view.click({ position: { x: 200, y: 300 } });
  await expect(title(page)).toHaveText("Original One");
  await expect(page.getByTestId("stage-notes")).toContainText(
    "Count in 4 bars",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(title(page)).toHaveText("Paper Planes");
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Original One");
});

test("swipe right goes back", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse drag swipe; touch swipes are not emulated here");
  await openStage(page);
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Midnight Train");
  await page.mouse.move(100, 300);
  await page.mouse.down();
  await page.mouse.move(250, 305, { steps: 5 });
  await page.mouse.up();
  await expect(title(page)).toHaveText("Skyline Drive");
});

test("position survives a reload and the exit control leaves", async ({
  page,
}) => {
  await openStage(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(position(page)).toHaveText("3 of 5");
  await page.reload();
  await expect(title(page)).toHaveText("Paper Planes");
  await expect(position(page)).toHaveText("3 of 5");
  await page.getByRole("button", { name: "Exit stage mode" }).click();
  await expect(page.getByTestId("stage-view")).toBeHidden();
});

test("renders from the cache with no connection", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "Service worker offline is verified on desktop only");
  await openStage(page);
  await expect(page.getByTestId("stage-offline")).toHaveText(
    "Available offline",
    { timeout: 20_000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(title(page)).toHaveText("Skyline Drive");
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Midnight Train");
  await context.setOffline(false);
});
