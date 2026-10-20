import { BANDS, USERS, memberships } from "@greenroom/db";
import { and, eq } from "drizzle-orm";
import { request as pwRequest } from "@playwright/test";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

const sheet = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("dialog", { name });
const card = (page: import("@playwright/test").Page, name: string) =>
  page.getByTestId("member-card").filter({ hasText: name });

test("member cards show name, instruments, and the admin badge", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await expect(page.getByTestId("member-card")).toHaveCount(4);
  const ava = card(page, USERS.ava.displayName);
  await expect(ava).toContainText("Guitar, Vocals");
  await expect(ava.getByText("Admin", { exact: true })).toBeVisible();
  const cleo = card(page, USERS.cleo.displayName);
  await expect(cleo).toContainText("Keys / Piano, Theremin");
  await expect(cleo.getByText("Admin", { exact: true })).toHaveCount(0);
});

test("tapping a member opens a sheet with contact info and instruments", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto("/roster");
  await card(page, USERS.dev.displayName).getByRole("button").first().click();
  const s = sheet(page, USERS.dev.displayName);
  await expect(s).toBeVisible();
  await expect(s.getByTestId("member-email")).toHaveText(USERS.dev.email);
  await expect(s.getByText("Drums", { exact: true })).toBeVisible();
  await s.getByRole("button", { name: "Close" }).click();
  await expect(s).toBeHidden();
});

test("a regular member sees no admin actions or reset link", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto("/roster");
  await card(page, USERS.dev.displayName).getByRole("button").first().click();
  const s = sheet(page, USERS.dev.displayName);
  await expect(s).toBeVisible();
  await expect(s.getByRole("button", { name: "Make admin" })).toHaveCount(0);
  await expect(s.getByRole("button", { name: "Remove from band" })).toHaveCount(
    0,
  );
  await s.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Invite link" }).click();
  await expect(page.getByLabel("Invite link", { exact: true })).toHaveValue(
    /\/invite\/.+/,
  );
  await expect(page.getByRole("button", { name: "Reset link" })).toHaveCount(0);
});

test("admin promotes and demotes a member", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await card(page, USERS.cleo.displayName).getByRole("button").first().click();
  const s = sheet(page, USERS.cleo.displayName);
  await s.getByRole("button", { name: "Make admin" }).click();
  await expect(s.getByRole("button", { name: "Remove admin" })).toBeVisible();
  const roleOf = async () =>
    (
      await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, USERS.cleo.id),
            eq(memberships.bandId, BANDS.nightOwls.id),
          ),
        )
    )[0]?.role;
  expect(await roleOf()).toBe("admin");
  await expect(
    card(page, USERS.cleo.displayName).getByText("Admin", { exact: true }),
  ).toBeVisible();

  await s.getByRole("button", { name: "Remove admin" }).click();
  await expect(s.getByRole("button", { name: "Make admin" })).toBeVisible();
  expect(await roleOf()).toBe("member");
});

test("admin has no actions on their own row", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await card(page, USERS.ava.displayName).getByRole("button").first().click();
  const s = sheet(page, USERS.ava.displayName);
  await expect(s).toBeVisible();
  await expect(s.getByRole("button", { name: "Remove admin" })).toHaveCount(0);
  await expect(s.getByRole("button", { name: "Remove from band" })).toHaveCount(
    0,
  );
});

test("admin removes a member after confirming", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await card(page, USERS.dev.displayName).getByRole("button").first().click();
  const s = sheet(page, USERS.dev.displayName);
  await s.getByRole("button", { name: "Remove from band" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByTestId("member-card")).toHaveCount(4);

  await s.getByRole("button", { name: "Remove from band" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(page.getByTestId("member-card")).toHaveCount(3);
  await expect(card(page, USERS.dev.displayName)).toHaveCount(0);
});

test("invite button copies the link", async ({
  page,
  context,
  browserName,
  testApi,
  loginAs,
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: WEB_URL,
    });
  }
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto("/roster");
  await page.getByRole("button", { name: "Invite link" }).click();
  const field = page.getByLabel("Invite link", { exact: true });
  await expect(field).toHaveValue(/\/invite\/.+/);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await field.inputValue(),
    );
  }
});

test("admin resets the invite link and the old one stops working", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await page.getByRole("button", { name: "Invite link" }).click();
  const field = page.getByLabel("Invite link", { exact: true });
  await expect(field).toHaveValue(/\/invite\/.+/);
  const first = await field.inputValue();
  const token = (url: string) => url.split("/invite/")[1]!;

  const anon = await pwRequest.newContext({ baseURL: API_URL });
  expect((await anon.get(`/invites/${token(first)}`)).status()).toBe(200);

  await page.getByRole("button", { name: "Reset link" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reset link" })
    .click();
  await expect(field).not.toHaveValue(first);
  expect((await anon.get(`/invites/${token(first)}`)).status()).toBe(404);
  const next = await field.inputValue();
  expect((await anon.get(`/invites/${token(next)}`)).status()).toBe(200);
  await anon.dispose();
});
