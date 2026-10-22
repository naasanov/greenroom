import { USERS, oauthConnections } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { fabAction, openLibrary } from "./library-helpers.js";
import {
  apiWithCookie,
  connectSpotify,
  fakeSpotifyConsent,
} from "./spotify-helpers.js";

const PLAYLIST = "https://open.spotify.com/playlist/fakePlaylistPublic";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

async function startImport(page: import("@playwright/test").Page) {
  await openLibrary(page);
  await fabAction(page, "import-playlist");
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await dialog.getByRole("textbox", { name: "Playlist link" }).fill(PLAYLIST);
  await dialog.getByRole("button", { name: "Import" }).click();
  return dialog;
}

test("import without a connection asks to connect, then resumes", async ({
  page,
}) => {
  await fakeSpotifyConsent(page);
  const dialog = await startImport(page);
  await expect(dialog.getByTestId("import-connect")).toContainText(
    "Connect Spotify to import playlists",
  );
  await dialog.getByRole("button", { name: "Connect Spotify" }).click();
  const reopened = page.getByRole("dialog", { name: "Import playlist" });
  await expect(reopened.getByTestId("import-summary")).toHaveText(
    "3 added, 0 already in library",
  );
  await expect(page).toHaveURL(/\/library$/);
});

test("cancel closes the connect prompt", async ({ page }) => {
  const dialog = await startImport(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("a failed Spotify login reopens with an error and Connect", async ({
  page,
}) => {
  await fakeSpotifyConsent(page, "deny");
  const dialog = await startImport(page);
  await dialog.getByRole("button", { name: "Connect Spotify" }).click();
  const reopened = page.getByRole("dialog", { name: "Import playlist" });
  await expect(reopened.getByTestId("import-connect-error")).toHaveText(
    "Couldn't connect Spotify. Try again.",
  );
  await expect(
    reopened.getByRole("button", { name: "Connect Spotify" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
});

test("a revoked grant shows the connect prompt again", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectSpotify(api);
  await api.dispose();
  await testApi.revokeSpotifyRefreshTokens();
  // An expired access token forces a refresh, which the revoked grant rejects.
  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  const dialog = await startImport(page);
  await expect(dialog.getByTestId("import-connect")).toBeVisible();
});
