import type { Page } from "@playwright/test";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { cards, fabAction, openLibrary } from "./library-helpers.js";
import { apiWithCookie, connectSpotify } from "./spotify-helpers.js";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  // Import needs a Spotify login; connect through the API so the UI test skips it.
  const api = await apiWithCookie(cookie);
  await connectSpotify(api);
  await api.dispose();
});

test("importing a playlist shows the summary and skips repeats", async ({
  page,
}) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPublic");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toHaveText("3 added");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(cards(page).filter({ hasText: "Mr. Brightside" })).toHaveCount(
    1,
  );
  await expect(cards(page)).toHaveCount(11);

  await fabAction(page, "import-playlist");
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPublic");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toHaveText(
    "0 added, 3 already in library",
  );
});

test("a connected account sees the link input and no connect prompt", async ({
  page,
}) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await expect(
    dialog.getByRole("textbox", { name: "Playlist link" }),
  ).toBeVisible();
  await expect(dialog.getByTestId("import-connect")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Your library" }),
  ).toHaveCount(0);
});

const PUBLIC_LINK = "https://open.spotify.com/playlist/fakePlaylistPublic";
const PRIVATE_LINK = "https://open.spotify.com/playlist/fakePlaylistPrivate";
const NOT_OWNED_LINK = "https://open.spotify.com/playlist/fakePlaylistNotOwned";

async function openImportDialog(page: Page) {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  return page.getByRole("dialog", { name: "Import playlist" });
}

test("a readable playlist shows its name and track count and enables Import", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill(PUBLIC_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveText(
    'Valid to import: "Fake Public Setlist" (3 songs)',
  );
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "importable",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeEnabled();
});

test("Import stays disabled and no message shows before a link is pasted", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
  await expect(dialog.getByTestId("import-check")).toHaveCount(0);
});

test("Import is disabled while the check runs", async ({ page, isMobile }) => {
  test.skip(isMobile, "WebKit does not reliably apply page.route");
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/songs/import/check", async (route) => {
    await held;
    await route.continue();
  });
  const dialog = await openImportDialog(page);
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill(PUBLIC_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "checking",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
  release();
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "importable",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeEnabled();
});

test("a failed check offers Try again, which re-runs it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "WebKit does not reliably apply page.route");
  let fail = true;
  await page.route("**/songs/import/check", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 500, body: "{}" });
      return;
    }
    await route.continue();
  });
  const dialog = await openImportDialog(page);
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill(PUBLIC_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "error",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
  await dialog.getByTestId("import-check-retry").click();
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "importable",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeEnabled();
});

test("a playlist the account only has metadata for explains the owner-only rule", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  const input = dialog.getByRole("textbox", { name: "Playlist link" });
  for (const link of [NOT_OWNED_LINK, PRIVATE_LINK]) {
    await input.fill(link);
    await expect(dialog.getByTestId("import-check")).toContainText(
      "Only playlists you own or collaborate on can be imported",
    );
    await expect(dialog.getByTestId("import-check")).toHaveAttribute(
      "data-state",
      "metadata-only",
    );
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
  }
});

test("a missing or non-playlist link is invalid and Import stays disabled", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  const input = dialog.getByRole("textbox", { name: "Playlist link" });
  for (const link of [
    "https://open.spotify.com/playlist/doesNotExist",
    "https://open.spotify.com/track/fakeTrack1",
    "not a link",
  ]) {
    await input.fill(link);
    await expect(dialog.getByTestId("import-check")).toContainText(
      "Invalid link",
    );
    await expect(dialog.getByTestId("import-check")).toHaveAttribute(
      "data-state",
      "invalid",
    );
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
  }
});

test("changing the link re-runs the check", async ({ page }) => {
  const dialog = await openImportDialog(page);
  const input = dialog.getByRole("textbox", { name: "Playlist link" });
  const button = dialog.getByRole("button", { name: "Import" });
  await input.fill(PUBLIC_LINK);
  await expect(button).toBeEnabled();
  await input.fill(NOT_OWNED_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "metadata-only",
  );
  await expect(button).toBeDisabled();
  await input.fill(PUBLIC_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "importable",
  );
  await expect(button).toBeEnabled();
  await input.fill("");
  await expect(dialog.getByTestId("import-check")).toHaveCount(0);
  await expect(button).toBeDisabled();
});

test("a slow check for an old link does not overwrite the new link's result", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "WebKit does not reliably apply page.route");
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/songs/import/check", async (route) => {
    if (route.request().postData()?.includes("fakePlaylistPublic")) {
      await held;
    }
    await route.continue();
  });
  const dialog = await openImportDialog(page);
  const input = dialog.getByRole("textbox", { name: "Playlist link" });
  const firstRequest = page.waitForRequest("**/songs/import/check");
  await input.fill(PUBLIC_LINK);
  await firstRequest;
  await input.fill(NOT_OWNED_LINK);
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "metadata-only",
  );
  // Let the late response land, then confirm it did not replace the current state.
  const lateResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/songs/import/check") &&
      !!r.request().postData()?.includes("fakePlaylistPublic"),
  );
  release();
  await lateResponse;
  await expect(dialog.getByTestId("import-check")).toHaveAttribute(
    "data-state",
    "metadata-only",
  );
  await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
});

test("the owner's linked Spotify account can import a private playlist", async ({
  page,
  loginAs,
}) => {
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectSpotify(api, "owner");
  await api.dispose();
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPrivate");
  await expect(dialog.getByTestId("import-check")).toHaveText(
    'Valid to import: "Fake Private Setlist" (2 songs)',
  );
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toHaveText("2 added");
});

test("bulk import does no reference-suggestion lookups", async ({
  page,
  testApi,
}) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPublic");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toContainText("3 added");
  expect(await testApi.suggestionCalls()).toEqual({ musiclink: [] });
});
