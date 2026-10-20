import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

const switcher = (page: Page, name: string | RegExp) =>
  page
    .getByRole("button", { name: new RegExp(`Switch band, current: `) })
    .filter({
      hasText: name,
    });

/** Requests a magic link from the sign-in form and returns the emailed URL. */
async function requestLink(page: Page, testApi: TestApi, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  let link = "";
  await expect
    .poll(async () => {
      link = (await testApi.magicLinksFor(email)).at(-1)?.link ?? "";
      return link;
    })
    .toContain("/auth/callback?token=");
  return link;
}

test("new user signs in by magic link, sets up a profile, and creates a band", async ({
  page,
  testApi,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toHaveAttribute("href", /\/auth\/google\/start\?redirectTo=%2F$/);
  const link = await requestLink(page, testApi, "new@example.com");

  await page.goto(link);
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByLabel("Your name")).not.toHaveValue("");
  await page.getByLabel("Your name").fill("Nina New");
  await page.getByRole("button", { name: "Guitar" }).click();
  await page.getByLabel("Custom instrument").fill("Oud");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Create a band" }),
  ).toBeVisible();
  await expect(
    page.getByText("Open the invite link your bandmate"),
  ).toBeVisible();
  await page.getByLabel("Band name").fill("The Newcomers");
  await page.getByRole("button", { name: "Create band" }).click();

  await expect(
    page.getByRole("button", { name: "Switch band, current: The Newcomers" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Roster" }).click();
  const card = page.getByTestId("member-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Nina New");
  await expect(card).toContainText("Guitar");
  await expect(card).toContainText("Oud");
  await expect(card).toContainText("Admin");
});

test("protected routes redirect to sign-in and return after login", async ({
  page,
  testApi,
}) => {
  await testApi.seed("band");
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?redirectTo=%2F$/);
  const link = await requestLink(page, testApi, USERS.ava.email);
  await page.goto(link);
  await expect(
    page.getByRole("button", { name: /Switch band, current: The Night Owls/ }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("sign-in shows Google callback errors", async ({ page }) => {
  await page.goto("/sign-in?error=invalid_state");
  await expect(page.getByText("That Google sign-in expired")).toBeVisible();
});

test("an expired magic link explains itself", async ({ page }) => {
  await page.goto("/auth/callback?token=bogus");
  await expect(
    page.getByRole("heading", { name: "This link did not work" }),
  ).toBeVisible();
});

test("sign out returns to sign-in and protects the app again", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/");
  await page.getByRole("button", { name: "Profile and settings" }).click();
  await expect(page.getByText(USERS.ava.email)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?redirectTo=%2F$/);
});

test("a user with a stale session cookie is sent to sign-in", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "gr_session", value: "stale", url: WEB_URL },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?redirectTo=%2F$/);
});

test("band switcher moves between bands and remembers the choice", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  await page.goto("/");
  await page.getByRole("button", { name: /Switch band/ }).click();
  await page.getByRole("menuitem", { name: /Side Project/ }).click();
  await expect(switcher(page, "Side Project")).toBeVisible();
  await page.reload();
  await expect(switcher(page, "Side Project")).toBeVisible();

  await page.getByRole("button", { name: /Switch band/ }).click();
  await page.getByRole("menuitem", { name: "Create another band" }).click();
  await page.getByLabel("Band name").fill("Third Wheel");
  await page.getByRole("button", { name: "Create band" }).click();
  await expect(switcher(page, "Third Wheel")).toBeVisible();
});

test("invite flow: admin shares the link, a new user signs in, joins, and sees the band", async ({
  page,
  browser,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/");
  await page.getByRole("button", { name: "Roster" }).click();
  await page.getByRole("button", { name: "Invite link" }).click();
  const field = page.getByLabel("Invite link", { exact: true });
  await expect(field).toHaveValue(/\/invite\/.+/);
  const first = await field.inputValue();
  await page.getByRole("button", { name: "Reset link" }).click();
  await page.getByRole("button", { name: "Reset link" }).last().click();
  await expect(field).not.toHaveValue(first);
  const inviteUrl = await field.inputValue();
  expect(inviteUrl.startsWith(`${WEB_URL}/invite/`)).toBe(true);

  // The old link is dead for everyone.
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(first);
  await expect(
    gp.getByRole("heading", { name: "This invite link is no longer valid" }),
  ).toBeVisible();

  await gp.goto(inviteUrl);
  await expect(
    gp.getByRole("heading", { name: "The Night Owls" }),
  ).toBeVisible();
  await expect(gp.getByText(/\d+ members/)).toBeVisible();
  await gp.getByRole("link", { name: "Sign in to join" }).click();
  await expect(gp).toHaveURL(/\/sign-in\?redirectTo=%2Finvite%2F/);
  const link = await requestLink(gp, testApi, "guest@example.com");
  await gp.goto(link);
  await expect(gp).toHaveURL(/\/welcome\?redirectTo=%2Finvite%2F/);
  await gp.getByRole("button", { name: "Bass" }).click();
  await gp.getByRole("button", { name: "Continue" }).click();
  await expect(gp).toHaveURL(inviteUrl);
  await gp.getByRole("button", { name: "Join The Night Owls" }).click();
  await expect(switcher(gp, "The Night Owls")).toBeVisible();
  await expect(switcher(gp, "The Night Owls")).toContainText("NO");
  await gp.getByRole("button", { name: "Roster" }).click();
  await expect(gp.getByTestId("member-card")).toHaveCount(5);
  await guest.close();
});
