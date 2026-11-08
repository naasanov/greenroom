import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("a visited page loads offline with an offline state, an unvisited one shows the offline page", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "Service worker offline is verified on desktop only");
  await page.goto("/roster");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => !!(await caches.match("/roster", { ignoreVary: true })),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-state")).toBeVisible();

  await page.goto("/privacy").catch(() => {});
  await expect(page.getByTestId("offline-page")).toBeVisible();
  await context.setOffline(false);
});
