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

test("a private playlist shows the cannot-see message", async ({ page }) => {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog
    .getByRole("textbox", { name: "Playlist link" })
    .fill("https://open.spotify.com/playlist/fakePlaylistPrivate");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-error")).toHaveText(
    "Can't see this playlist — it might be private",
  );
});
