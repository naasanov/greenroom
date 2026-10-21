import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import {
  apiAs,
  cards,
  chooseSort,
  openLibrary,
  sheet,
} from "./library-helpers.js";

test("empty library shows the empty state", async ({
  page,
  testApi,
  loginAs,
}) => {
  const { user } = await loginAs("solo@example.com");
  const api = await apiAs(testApi, user.email);
  expect((await api.post("/bands", { data: { name: "The Foxes" } })).ok()).toBe(
    true,
  );
  await openLibrary(page);
  await expect(
    page.getByText("No music yet — press + to add one"),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test("cards show art placeholder, title, artist and duration", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await expect(cards(page)).toHaveCount(8);
  const skyline = cards(page).filter({ hasText: "Skyline Drive" });
  await expect(skyline).toContainText("The Meridians");
  await expect(skyline).toContainText("3:34");
  // A title-only song still renders as a full card.
  const jam = cards(page).filter({ hasText: "Original One" });
  await expect(jam).toBeVisible();
});

test("search filters by title or artist", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await page.getByRole("searchbox", { name: "Search songs" }).fill("meridians");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText("Skyline Drive");
  await page.getByRole("searchbox", { name: "Search songs" }).fill("zzzz");
  await expect(page.getByText("No songs match your search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("sort options reorder the list and persist per device", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  const sortButton = page.getByRole("button", { name: "Sort songs" });
  await expect(sortButton).toHaveText("Recently added");

  await chooseSort(page, "Title A-Z");
  await expect(cards(page).first()).toContainText("Harbor Lights");
  await expect(cards(page).last()).toContainText("Skyline Drive");

  await chooseSort(page, "Artist A-Z");
  await expect(cards(page).first()).toContainText("Midnight Train");

  for (const label of ["Last played", "Most played", "Recently added"]) {
    await chooseSort(page, label);
    await expect(sortButton).toHaveText(label);
    await expect(cards(page)).toHaveCount(8);
  }

  await chooseSort(page, "Title A-Z");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sort songs" })).toHaveText(
    "Title A-Z",
  );
  await expect(cards(page).first()).toContainText("Harbor Lights");
});

test("opening and closing a song updates the URL without remounting the list", async ({
  page,
  testApi,
  loginAs,
  isMobile,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await page.getByRole("list", { name: "Songs" }).evaluate((el) => {
    el.setAttribute("data-marker", "kept");
  });

  await cards(page).filter({ hasText: "Skyline Drive" }).click();
  await expect(page).toHaveURL(new RegExp(`/songs/${seed.songs.skyline.id}$`));
  await expect(sheet(page)).toContainText("Skyline Drive");

  if (!isMobile) {
    // The sheet stays open while other songs are clicked.
    await cards(page).filter({ hasText: "Paper Planes" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/songs/${seed.songs.paperPlanes.id}$`),
    );
    await expect(sheet(page)).toContainText("Paper Planes");
  }

  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("list", { name: "Songs" })).toHaveAttribute(
    "data-marker",
    "kept",
  );
});

test("song link to a missing song shows the no-access state", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/songs/00000000-0000-4000-8000-00000000dead");
  await expect(
    page.getByText("This link doesn't exist or you don't have access"),
  ).toBeVisible();
});
