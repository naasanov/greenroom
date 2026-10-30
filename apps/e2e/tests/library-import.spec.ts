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
  await expect(dialog.getByTestId("import-summary")).toHaveText(
    "3 added, 0 already in library",
  );
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

test("a private playlist of another account shows a clear message", async ({
  page,
}) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPrivate");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-error")).toContainText(
    "Spotify won't share this playlist with your account",
  );
});

test("a missing playlist says it cannot be found", async ({ page }) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/doesNotExist");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-error")).toContainText(
    "Can't find this playlist",
  );
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
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toHaveText(
    "2 added, 0 already in library",
  );
});

test("the Your library mode searches existing songs without importing", async ({
  page,
}) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog.getByRole("button", { name: "Your library" }).click();
  await dialog
    .getByRole("textbox", { name: "Search your library" })
    .fill("sky");
  const results = dialog.getByTestId("import-library-results");
  await expect(results).toContainText("Skyline");
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await dialog
    .getByRole("textbox", { name: "Search your library" })
    .fill("zzzz-nothing");
  await expect(dialog).toContainText("No songs in your library match.");
});
