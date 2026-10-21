import { request as pwRequest, type Page } from "@playwright/test";
import { API_URL } from "../src/env.js";
import type { TestApi } from "../src/test-api.js";

export const sheet = (page: Page) => page.getByTestId("right-sheet");
export const cards = (page: Page) => page.getByTestId("list-card");

export async function openLibrary(page: Page) {
  await page.goto("/library");
  await page.getByTestId("library-tab").waitFor();
}

export async function fabAction(
  page: Page,
  key: "add-song" | "import-playlist",
) {
  await page.getByRole("button", { name: "Add music" }).click();
  await page.getByTestId(`fab-action-${key}`).click();
}

export async function chooseSort(page: Page, label: string) {
  await page.getByRole("button", { name: "Sort songs" }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

/** An API client acting as this email, for arranging data. */
export async function apiAs(testApi: TestApi, email: string) {
  const { cookie } = await testApi.login(email);
  return pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
}
