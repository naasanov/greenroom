import { BANDS, USERS, bands } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

const switcher = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name: `Switch band, current: ${name}` });

test("a regular member leaves and the app switches to their other band", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ben.email);
  const api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  await api.put("/me/current-band", { data: { bandId: BANDS.nightOwls.id } });
  await api.dispose();

  await page.goto("/settings");
  await expect(switcher(page, "The Night Owls")).toBeVisible();
  await page.getByRole("button", { name: "Leave The Night Owls" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave band" })
    .click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(switcher(page, "Side Project")).toBeVisible();
});

test("the last admin cannot leave until someone else is admin", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Leave The Night Owls" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave band" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "last admin" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(switcher(page, "The Night Owls")).toBeVisible();
});

test("the only member must delete the band, typing its name to confirm", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ben.email);
  // Ben's first band in the list is irrelevant: make Side Project current via the switcher.
  await page.goto("/settings");
  if (!(await switcher(page, "Side Project").isVisible())) {
    await page.getByRole("button", { name: /Switch band/ }).click();
    await page.getByRole("menuitem", { name: /Side Project/ }).click();
  }
  await expect(switcher(page, "Side Project")).toBeVisible();

  await page.getByRole("button", { name: "Delete band" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Side Project?" });
  const confirm = dialog.getByRole("button", { name: "Delete band" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Side Project to confirm").fill("Side Project");
  await confirm.click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(switcher(page, "The Night Owls")).toBeVisible();
  expect(
    await db.select().from(bands).where(eq(bands.id, BANDS.sideProject.id)),
  ).toHaveLength(0);
});

test("leaving the only band returns to the start screen", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.cleo.email);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Leave The Night Owls" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave band" })
    .click();
  await expect(
    page.getByText("Open the invite link your bandmate"),
  ).toBeVisible();
});
