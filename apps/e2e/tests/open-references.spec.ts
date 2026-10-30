import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { apiAs } from "./library-helpers.js";

const AVA = USERS.ava.email;
let seed: BandSeedResult;

declare global {
  interface Window {
    __opened: string[];
  }
}

test.beforeEach(async ({ testApi, loginAs, page }) => {
  seed = await testApi.seed("band");
  const api = await apiAs(testApi, AVA);
  const bandId = seed.bands.nightOwls.id;
  const gigId = seed.gigs.tentative.id;
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gigId}/setlist`)
  ).json();
  const order = [SONGS.skyline, SONGS.paperPlanes, SONGS.lowTide];
  await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: { songIds: order.map((s) => s.id) },
  });
  const refs: Record<string, { label: string; value: string }[]> = {
    [SONGS.skyline.id]: [
      { label: "Bass tab", value: "https://example.com/skyline-bass" },
      { label: "Lyrics", value: "https://example.com/skyline-lyrics" },
    ],
    [SONGS.lowTide.id]: [
      { label: "Bass tab", value: "https://example.com/lowtide-bass" },
    ],
  };
  for (const [id, references] of Object.entries(refs)) {
    const res = await api.patch(`/bands/${bandId}/songs/${id}`, {
      data: { references },
    });
    expect(res.ok()).toBe(true);
  }
  await api.dispose();
  // Counts window.open calls; a URL containing "lowtide" is reported as blocked.
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = ((url?: string | URL) => {
      window.__opened.push(String(url));
      return String(url).includes("lowtide") ? null : ({} as Window);
    }) as typeof window.open;
  });
  await loginAs(AVA);
  await page.goto(`/gigs/${gigId}`);
  await expect(page.getByTestId("setlist-row")).toHaveCount(3);
});

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Open references" });

async function openDialog(page: Page) {
  await page.getByRole("button", { name: "Open references" }).click();
  await expect(dialog(page)).toBeVisible();
}

test("tag chips show counts and the preview follows setlist order", async ({
  page,
}) => {
  await openDialog(page);
  const bass = dialog(page).getByRole("radio", { name: /^Bass tab/ });
  await expect(bass).toHaveText("Bass tab (2 of 3 songs)");
  await expect(dialog(page).getByRole("radio", { name: /^Lyrics/ })).toHaveText(
    "Lyrics (1 of 3 songs)",
  );
  await bass.click();
  const items = dialog(page).getByTestId("reference-preview").locator("li");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText(SONGS.skyline.title);
  await expect(items.nth(1)).toContainText(SONGS.paperPlanes.title);
  await expect(items.nth(1)).toContainText("No link");
  await expect(items.nth(2)).toContainText(SONGS.lowTide.title);
});

test("Open all reports opened and blocked tabs; the last tag is remembered", async ({
  page,
}) => {
  await openDialog(page);
  await dialog(page)
    .getByRole("radio", { name: /^Lyrics/ })
    .click();
  await dialog(page).getByRole("button", { name: "Open all" }).click();
  await expect(dialog(page).getByTestId("open-result")).toHaveText("1 opened.");
  expect(await page.evaluate(() => window.__opened)).toEqual([
    "https://example.com/skyline-lyrics",
  ]);

  await dialog(page)
    .getByRole("radio", { name: /^Bass tab/ })
    .click();
  await dialog(page).getByRole("button", { name: "Open all" }).click();
  await expect(dialog(page).getByTestId("open-result")).toContainText(
    "1 opened, 1 blocked.",
  );
  expect(await page.evaluate(() => window.__opened.length)).toBe(3);

  // Closing and reopening keeps the last chosen tag selected.
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toBeHidden();
  await openDialog(page);
  await expect(
    dialog(page).getByRole("radio", { name: /^Bass tab/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(dialog(page).getByTestId("reference-preview")).toBeVisible();
});

test("the references button is hidden for an empty setlist", async ({
  page,
}) => {
  await page.goto(`/gigs/${seed.gigs.pastFestival.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
  await expect(page.getByTestId("setlist-empty")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open references" }),
  ).toHaveCount(0);
});
