import { USERS, oauthConnections } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { apiAs, openLibrary } from "./library-helpers.js";
import { apiWithCookie } from "./spotify-helpers.js";
import { connectYoutube, fakeYoutubeConsent } from "./youtube-helpers.js";

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Export songs" });
const save = (page: Page) =>
  dialog(page).getByRole("button", { name: "Export to YouTube", exact: true });
const connectButton = (page: Page) =>
  dialog(page).getByTestId("export-youtube-connect-button");

async function openExport(page: Page) {
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await expect(dialog(page).getByLabel("Playlist name")).toBeVisible();
}

test("not connected: a connect button replaces the export button", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openExport(page);

  await expect(connectButton(page)).toHaveText("Connect to YouTube to export");
  await expect(connectButton(page).locator("svg")).toHaveCount(1);
  await expect(save(page)).toHaveCount(0);
  await expect(dialog(page).getByTestId("export-youtube-account")).toHaveCount(
    0,
  );
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);
});

test("connect round trip returns to the dialog, strips the params, and saves a playlist", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await fakeYoutubeConsent(page);
  await openExport(page);
  await dialog(page).getByLabel("Playlist name").fill("Owls on YouTube");
  await connectButton(page).click();

  await expect(dialog(page).getByTestId("export-youtube-connected")).toHaveText(
    "YouTube connected.",
  );
  await expect(dialog(page).getByLabel("Playlist name")).toHaveValue(
    "Owls on YouTube",
  );
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    dialog(page).getByTestId("export-youtube-account"),
  ).toContainText("tester@example.com");
  // Reconnecting never saved anything; the export is resumed by the user.
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);

  await save(page).click();
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs to “Owls on YouTube”.",
  );
  await expect(dialog(page).getByTestId("export-skipped")).toHaveText(
    "Skipped 5 songs without a YouTube link.",
  );
  await expect(dialog(page).getByTestId("export-skipped")).toHaveCount(1);
  const link = dialog(page).getByRole("link", { name: "Open in YouTube" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute(
    "href",
    /^https:\/\/www\.youtube\.com\/playlist\?list=fakeYtPlaylist1$/,
  );
  const playlists = await testApi.youtubeCreatedPlaylists();
  expect(playlists).toHaveLength(1);
  expect(playlists[0]).toMatchObject({
    name: "Owls on YouTube",
    isPublic: false,
  });
  expect(playlists[0]!.videoIds).toHaveLength(3);
});

test("a denied YouTube connect reopens with a notice and the connect button", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await fakeYoutubeConsent(page, "deny");
  await openExport(page);
  await connectButton(page).click();

  await expect(
    dialog(page).getByTestId("export-youtube-connect-error"),
  ).toHaveText("Couldn't connect YouTube. Try again.");
  await expect(page).toHaveURL(/\/library$/);
  await expect(connectButton(page)).toBeVisible();
});

test("a connected user saves a gig setlist in order and can disconnect", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const gig = seed.gigs.upcomingClub;
  const bandId = seed.bands.nightOwls.id;
  const api = await apiAs(testApi, USERS.ava.email);
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gig.id}/setlist`)
  ).json();
  await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: {
      songIds: [
        seed.songs.redLine.id,
        seed.songs.skyline.id,
        seed.songs.harborLights.id,
      ],
    },
  });
  await api.dispose();
  const session = await apiWithCookie(cookie);
  await connectYoutube(session);
  await session.dispose();

  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await expect(save(page)).toBeVisible();
  await expect(connectButton(page)).toHaveCount(0);
  await save(page).click();

  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 2 songs",
  );
  await expect(dialog(page).getByTestId("export-skipped")).toHaveText(
    "Skipped 1 song without a YouTube link.",
  );
  const [playlist] = await testApi.youtubeCreatedPlaylists();
  expect(playlist!.videoIds).toEqual(["redLine", "harborLights"]);

  await dialog(page).getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await dialog(page).getByTestId("export-youtube-disconnect").click();
  await expect(connectButton(page)).toBeVisible();
  await expect(save(page)).toHaveCount(0);
});

test("a quota error explains itself and keeps the export available", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectYoutube(api);
  await api.dispose();
  await testApi.setYoutubeQuotaExceeded(true);
  await openExport(page);
  await save(page).click();

  await expect(dialog(page).getByTestId("export-youtube-error")).toContainText(
    "daily limit",
  );
  await expect(save(page)).toBeEnabled();
  expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);

  await testApi.setYoutubeQuotaExceeded(false);
  await save(page).click();
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs",
  );
});

test("a revoked grant falls back to the connect prompt", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectYoutube(api);
  await api.dispose();
  await openExport(page);
  await expect(save(page)).toBeVisible();

  await db
    .update(oauthConnections)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  await testApi.revokeGoogleRefreshTokens();
  await save(page).click();

  await expect(dialog(page).getByTestId("export-youtube-error")).toContainText(
    "no longer valid",
  );
  await expect(connectButton(page)).toBeVisible();
  await expect(save(page)).toHaveCount(0);
});

test("a YouTube Music link counts as a YouTube link", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const bandId = seed.bands.nightOwls.id;
  const api = await apiAs(testApi, USERS.ava.email);
  for (const [title, value] of [
    ["Music Only", "https://music.youtube.com/watch?v=musicOnly01&si=abc"],
    ["Music Playlist", "https://music.youtube.com/playlist?list=PLmusic01"],
  ] as const) {
    await api.post(`/bands/${bandId}/songs`, {
      data: { title, references: [{ label: "YouTube Music", value }] },
    });
  }
  await api.dispose();
  const session = await apiWithCookie(cookie);
  await connectYoutube(session);
  await session.dispose();
  await openExport(page);
  await save(page).click();

  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 4 songs",
  );
  const [playlist] = await testApi.youtubeCreatedPlaylists();
  expect(playlist!.videoIds).toContain("musicOnly01");
  expect(playlist!.videoIds).toHaveLength(4);
});
