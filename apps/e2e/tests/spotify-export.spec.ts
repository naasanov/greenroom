import { USERS, oauthConnections } from "@greenroom/db";
import { eq } from "drizzle-orm";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { apiAs, openLibrary } from "./library-helpers.js";
import {
  apiWithCookie,
  connectSpotify,
  fakeSpotifyConsent,
} from "./spotify-helpers.js";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const label = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d} ${y}`;
};

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Export songs" });
const exportButton = (page: Page) =>
  dialog(page).getByRole("button", { name: "Export to Spotify", exact: true });
const connectButton = (page: Page) =>
  dialog(page).getByRole("button", {
    name: "Connect to Spotify to export",
    exact: true,
  });

test("library export asks to connect, resumes, and shows skipped songs", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await fakeSpotifyConsent(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await expect(dialog(page).getByLabel("Playlist name")).toHaveValue(
    "The Night Owls library",
  );
  // Not connected: the export button is replaced by a connect button.
  await expect(connectButton(page)).toBeVisible();
  await expect(connectButton(page).locator("svg")).toHaveCount(1);
  await expect(exportButton(page)).toHaveCount(0);
  await expect(dialog(page).getByTestId("export-copy")).toBeVisible();
  // The name field carries a visible label above it.
  await expect(
    dialog(page).locator("label", { hasText: "Playlist name" }),
  ).toBeVisible();
  // Copy sits on its own row under the "or" divider, below the connect button.
  await expect(dialog(page).getByTestId("export-copy-divider")).toContainText(
    "or",
  );
  const connectBox = await connectButton(page).boundingBox();
  const copyBox = await dialog(page).getByTestId("export-copy").boundingBox();
  expect(copyBox!.y).toBeGreaterThan(connectBox!.y + connectBox!.height);
  await dialog(page).getByLabel("Playlist name").fill("Owls all songs");
  await connectButton(page).click();

  const reopened = dialog(page);
  await expect(reopened.getByTestId("export-summary")).toContainText(
    "Exported 3 songs to “Owls all songs”.",
  );
  await expect(reopened.getByTestId("export-skipped")).toHaveText(
    "Skipped 5 songs without a Spotify link.",
  );
  const link = reopened.getByRole("link", { name: "Open in Spotify" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute(
    "href",
    /^https:\/\/open\.spotify\.com\/playlist\/fakePlaylistCreated/,
  );
  await expect(page).toHaveURL(/\/library$/);

  const playlists = await testApi.spotifyCreatedPlaylists();
  expect(playlists).toHaveLength(1);
  const [playlist] = playlists;
  expect(playlist).toMatchObject({ name: "Owls all songs", isPublic: false });
  expect(playlist!.trackIds).toHaveLength(3);

  // Now connected with modify scopes: a second export needs no login.
  await reopened.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await exportButton(page).click();
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs",
  );
  expect(await testApi.spotifyCreatedPlaylists()).toHaveLength(2);
});

test("a denied Spotify login reopens with an error and Connect", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await fakeSpotifyConsent(page, "deny");
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await connectButton(page).click();
  await expect(dialog(page).getByTestId("export-connect-error")).toHaveText(
    "Couldn't connect Spotify. Try again.",
  );
  await expect(connectButton(page)).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
});

test("gig setlist export from the drawer", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const gig = seed.gigs.upcomingClub;
  const bandId = seed.bands.nightOwls.id;
  const api = await apiAs(testApi, USERS.ava.email);
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gig.id}/setlist`)
  ).json();
  await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: {
      songIds: [
        seed.songs.skyline.id,
        seed.songs.midnightTrain.id,
        seed.songs.lowTide.id,
      ],
    },
  });
  await api.dispose();

  await fakeSpotifyConsent(page);
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  const name = `${gig.title} setlist (${label(gig.date)})`;
  await expect(dialog(page).getByLabel("Playlist name")).toHaveValue(name);
  await connectButton(page).click();

  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    `Exported 2 songs to “${name}”.`,
  );
  await expect(dialog(page).getByTestId("export-skipped")).toHaveText(
    "Skipped 1 song without a Spotify link.",
  );
  await expect(page).toHaveURL(new RegExp(`/gigs/(.*-)?${gig.id}$`));
  const playlists = await testApi.spotifyCreatedPlaylists();
  expect(playlists).toHaveLength(1);
  const [playlist] = playlists;
  expect(playlist!.trackIds).toEqual([
    "spotify-track-skyline",
    "spotify-track-lowTide",
  ]);
});

test("the export button is hidden for an empty setlist", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto(`/gigs/${seed.gigs.tentative.id}`);
  await expect(page.getByTestId("setlist-empty")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export to Spotify" }),
  ).toHaveCount(0);
});

test("a connected user exports without being asked to connect again", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectSpotify(api);
  await api.dispose();
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await exportButton(page).click();
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs",
  );
  await expect(connectButton(page)).toHaveCount(0);
  expect(await testApi.spotifyCreatedPlaylists()).toHaveLength(1);
});

test("pressing Enter in the name field exports exactly once", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectSpotify(api);
  await api.dispose();
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  const name = dialog(page).getByLabel("Playlist name");
  await name.fill("Enter once");
  await name.press("Enter");
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs to “Enter once”.",
  );
  const playlists = await testApi.spotifyCreatedPlaylists();
  expect(playlists).toHaveLength(1);
  expect(playlists[0]).toMatchObject({ name: "Enter once" });
});

test("a read-only link asks to reconnect once with a clear message", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  const api = await apiWithCookie(cookie);
  await connectSpotify(api);
  await api.dispose();
  await db
    .update(oauthConnections)
    .set({ scopes: ["playlist-read-private", "playlist-read-collaborative"] })
    .where(eq(oauthConnections.userId, USERS.ava.id));

  await fakeSpotifyConsent(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await exportButton(page).click();
  await expect(dialog(page).getByTestId("export-connect")).toContainText(
    "Reconnect Spotify to grant playlist access",
  );
  await expect(dialog(page).getByTestId("export-copy-divider")).toBeVisible();
  await expect(dialog(page).getByTestId("export-copy")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Reconnect Spotify" }).click();
  await expect(dialog(page).getByTestId("export-summary")).toContainText(
    "Exported 3 songs",
  );
  expect(await testApi.spotifyCreatedPlaylists()).toHaveLength(1);
});

test("copy to clipboard puts Title - Artist lines on the clipboard", async ({
  page,
  testApi,
  loginAs,
  context,
  browserName,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const stubbed = browserName !== "chromium";
  if (stubbed) {
    // Only chromium supports clipboard permissions; elsewhere capture writeText.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (t: string) => {
            (window as unknown as { __copied: string }).__copied = t;
          },
        },
      });
    });
  } else {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  const gig = seed.gigs.upcomingClub;
  const bandId = seed.bands.nightOwls.id;
  const api = await apiAs(testApi, USERS.ava.email);
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gig.id}/setlist`)
  ).json();
  await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: {
      songIds: [seed.songs.skyline.id, seed.songs.lowTide.id],
    },
  });
  await api.dispose();

  await page.goto(`/gigs/${gig.id}`);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  const copy = dialog(page).getByTestId("export-copy");
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(copy).toHaveText("Copied");
  const text = await page.evaluate(
    (useStub) =>
      useStub
        ? (window as unknown as { __copied: string }).__copied
        : navigator.clipboard.readText(),
    stubbed,
  );
  const lines = text.split("\n");
  expect(lines).toHaveLength(2);
  expect(lines[0]).toBe("Skyline Drive - The Meridians");
  expect(text).not.toContain("\u2014");
});

test("copy shows a failure state when no clipboard path works", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    document.execCommand = () => false;
  });
  await openLibrary(page);
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  const copy = dialog(page).getByTestId("export-copy");
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(copy).toHaveText("Copy failed");
});
