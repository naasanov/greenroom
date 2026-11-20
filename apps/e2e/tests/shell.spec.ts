import { BANDS, USERS } from "@greenroom/db";
import { WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { NIGHT_OWLS_SETTINGS, bandSettingsUrl } from "./band-helpers.js";

/** The primary nav that is visible for this project: bottom bar on mobile, top tabs on desktop. */
const nav = (page: import("@playwright/test").Page, isMobile: boolean) =>
  page.getByTestId(isMobile ? "bottom-tab-bar" : "top-tabs");

test("/ lands on Events and tabs navigate with browser history", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/");
  await expect(page).toHaveURL(/\/events$/);
  const tabs = nav(page, !!isMobile);
  await expect(tabs.getByRole("link", { name: "Events" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("calendar")).toBeVisible();

  await tabs.getByRole("link", { name: "Music Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByTestId("library-tab")).toBeVisible();

  await tabs.getByRole("link", { name: "Roster" }).click();
  await expect(page).toHaveURL(/\/roster$/);
  await expect(page.getByTestId("member-card")).toHaveCount(4);

  await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByTestId("library-tab")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/events$/);
});

test("reload on Roster stays on Roster", async ({ page, testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await expect(page.getByTestId("member-card")).toHaveCount(4);
  await page.reload();
  await expect(page).toHaveURL(/\/roster$/);
  await expect(page.getByTestId("member-card")).toHaveCount(4);
});

test("mobile shows the bottom bar and desktop the top tabs", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/events");
  await expect(page.getByTestId("bottom-tab-bar")).toBeVisible({
    visible: !!isMobile,
  });
  await expect(page.getByTestId("top-tabs")).toBeVisible({
    visible: !isMobile,
  });
});

test("users with no band get the start screen on tab routes", async ({
  page,
  loginAs,
}) => {
  await loginAs("loner@example.com");
  await page.goto("/roster");
  await expect(
    page.getByRole("heading", { name: "Create a band" }),
  ).toBeVisible();
  await expect(page.getByTestId("top-bar")).toHaveCount(0);
});

test("creating another band lands on Events", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await page.getByRole("button", { name: /Switch band/ }).click();
  await page.getByRole("menuitem", { name: "Create another band" }).click();
  await page.getByLabel("Band name").fill("Fresh Start");
  await page.getByRole("button", { name: "Create band" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(
    page.getByRole("button", { name: "Switch band, current: Fresh Start" }),
  ).toBeVisible();
});

test("the band picker has no separate Band settings entry", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/events");
  await page.getByRole("button", { name: /Switch band/ }).click();
  await expect(
    page.getByRole("menuitem", { name: "Settings for The Night Owls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Band settings" }),
  ).toHaveCount(0);
});

test("each band card has an aligned settings icon with a touch-sized hit area", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/events");
  await page.getByRole("button", { name: /Switch band/ }).click();
  const icons = page.getByRole("menuitem", { name: /^Settings for / });
  await expect(icons).toHaveCount(2);
  // The menu animates in; boundingBox includes transforms, so wait for stable boxes.
  const measure = async () => [
    (await icons.nth(0).boundingBox())!,
    (await icons.nth(1).boundingBox())!,
  ];
  let previous = "";
  let boxes = await measure();
  await expect
    .poll(
      async () => {
        boxes = await measure();
        const current = JSON.stringify(boxes);
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [100] },
    )
    .toBe(true);
  const [first, second] = boxes;
  // Only the active band shows a check mark, yet the icons share one column.
  expect(second.x).toBeCloseTo(first.x, 1);
  expect(first.width).toBeGreaterThanOrEqual(44);
  expect(first.height).toBeGreaterThanOrEqual(44);
});

test("the settings icon opens a non-active band's own settings", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/events");
  await expect(
    page.getByRole("button", { name: "Switch band, current: The Night Owls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Switch band/ }).click();
  await page
    .getByRole("menuitem", { name: "Settings for Side Project" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${bandSettingsUrl(BANDS.sideProject.id)}$`),
  );
  // The page shows Side Project even though The Night Owls stays the active band.
  await expect(page.getByTestId("band-settings-name")).toHaveText(
    "Side Project",
  );
  await expect(page.getByLabel("Band name", { exact: true })).toHaveValue(
    "Side Project",
  );
  await expect(page.getByRole("button", { name: "Delete band" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch band, current: The Night Owls" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("a band the user does not belong to shows no settings", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto(bandSettingsUrl(BANDS.sideProject.id));
  await expect(
    page.getByText("You are not a member of this band."),
  ).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
  await expect(page.getByTestId("settings-leave")).toHaveCount(0);
});

test("the old ?tab=band URL forwards to the active band's settings", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings?tab=band");
  await expect(page).toHaveURL(new RegExp(`${NIGHT_OWLS_SETTINGS}$`));
  await expect(page.getByTestId("settings-band")).toBeVisible();
});

test("profile icon opens a menu with Settings and Sign out", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await page.getByRole("button", { name: "Profile and settings" }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await expect(page).toHaveURL(/\/roster$/);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // Header stays, and no tab is marked active.
  await expect(page.getByRole("button", { name: /Switch band/ })).toBeVisible();
  await expect(
    nav(page, !!isMobile).locator('[aria-current="page"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId("settings-name")).toHaveText(
    USERS.ava.displayName,
  );
  await expect(page.getByTestId("settings-email")).toHaveText(USERS.ava.email);

  // Back returns to the tab the user came from.
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/roster$/);

  await page.getByRole("button", { name: "Profile and settings" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("settings back falls back to Events on a direct visit", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("Band section shows for admins and is hidden for members", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto(NIGHT_OWLS_SETTINGS);
  await expect(page.getByTestId("settings-band")).toBeVisible();
  await expect(page.getByLabel("Band name")).toHaveValue("The Night Owls");

  await page.getByRole("button", { name: "Profile and settings" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  // Leaves sign-in first so it can't redirect home once the new session exists.
  await page.goto("about:blank");
  await loginAs(USERS.cleo.email);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-name")).toHaveText(
    USERS.cleo.displayName,
  );
  await expect(page.getByRole("tab", { name: "Band" })).toHaveCount(0);
  await page.goto(NIGHT_OWLS_SETTINGS);
  await expect(page.getByTestId("settings-leave")).toBeVisible();
  await expect(page.getByTestId("settings-band")).toHaveCount(0);
});

test("share button copies the link and shows feedback", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  // Touch devices use the native share sheet, which cannot be driven here.
  test.skip(!!isMobile, "native share sheet on touch devices");
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: WEB_URL,
    });
  }
  await page.goto("/showcase");
  const share = page.getByRole("button", { name: "Share link" }).first();
  await share.scrollIntoViewIfNeeded();
  await share.click();
  await expect(page.getByText("Link copied")).toBeAttached();
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${WEB_URL}/showcase`,
    );
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Link copied" }),
  ).toHaveCount(0, { timeout: 4000 });
});

test("switching bands persists across a reload and a fresh browser context", async ({
  page,
  browser,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/events");
  const switcher = (p: import("@playwright/test").Page, name: string) =>
    p.getByRole("button", { name: `Switch band, current: ${name}` });
  await expect(switcher(page, "The Night Owls")).toBeVisible();
  await page.getByRole("button", { name: /Switch band/ }).click();
  await page
    .getByRole("menuitem", { name: /^(?!Settings for).*Side Project/ })
    .click();
  await expect(switcher(page, "Side Project")).toBeVisible();
  await page.reload();
  await expect(switcher(page, "Side Project")).toBeVisible();

  // The choice lives on the server, so another browser sees it too.
  const other = await browser.newContext();
  const { cookie } = await testApi.login(USERS.ben.email);
  await other.addCookies([
    { ...cookie, url: WEB_URL, httpOnly: true, sameSite: "Lax" },
  ]);
  const op = await other.newPage();
  await op.goto(`${WEB_URL}/events`);
  await expect(switcher(op, "Side Project")).toBeVisible();
  await other.close();
});
