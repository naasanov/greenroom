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
