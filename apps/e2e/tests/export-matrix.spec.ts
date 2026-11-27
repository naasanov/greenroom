import { USERS, type BandSeedResult } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import { apiAs, openLibrary } from "./library-helpers.js";
import { apiWithCookie, connectSpotify } from "./spotify-helpers.js";
import { connectYoutube } from "./youtube-helpers.js";

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Export songs" });

type Provider = "Spotify" | "YouTube";
const testId = (p: Provider) => p.toLowerCase();

/** The dialog's export or connect button for a provider, found by label. */
const exportButton = (page: Page, p: Provider) =>
  dialog(page).getByRole("button", { name: `Export to ${p}`, exact: true });
const connectButton = (page: Page, p: Provider) =>
  dialog(page).getByRole("button", {
    name: `Connect to ${p} to export`,
    exact: true,
  });

/**
 * Puts one linked song (per the flags) plus an unlinked one in the gig's
 * setlist and opens its export dialog.
 */
async function openSetlistExport(
  page: Page,
  testApi: TestApi,
  seed: BandSeedResult,
  links: { spotify: boolean; youtube: boolean },
) {
  const bandId = seed.bands.nightOwls.id;
  const gig = seed.gigs.upcomingClub;
  const api = await apiAs(testApi, USERS.ava.email);
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gig.id}/setlist`)
  ).json();
  let linked: string | null = null;
  if (links.spotify && links.youtube) {
    const res = await api.post(`/bands/${bandId}/songs`, {
      data: {
        title: "Both Links",
        spotifyTrackId: "spotify-track-both",
        youtubeUrl: "https://www.youtube.com/watch?v=bothLinks01",
        force: true,
      },
    });
    linked = (await res.json()).id;
  } else if (links.spotify) linked = seed.songs.skyline.id;
  else if (links.youtube) linked = seed.songs.redLine.id;
  await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: {
      songIds: [...(linked ? [linked] : []), seed.songs.originalOne.id],
    },
  });
  await api.dispose();
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
  await page.getByRole("button", { name: "Export to Spotify" }).click();
  await expect(dialog(page).getByLabel("Playlist name")).toBeVisible();
}

const bool = [true, false] as const;
for (const spotifyConnected of bool) {
  for (const youtubeConnected of bool) {
    for (const hasYoutubeLink of bool) {
      for (const hasSpotifyLink of bool) {
        const title = [
          `Spotify ${spotifyConnected ? "connected" : "not connected"}`,
          `YouTube ${youtubeConnected ? "connected" : "not connected"}`,
          `${hasYoutubeLink ? "with" : "without"} a YouTube link`,
          `${hasSpotifyLink ? "with" : "without"} a Spotify link`,
        ].join(", ");
        test(`export dialog: ${title}`, async ({ page, testApi, loginAs }) => {
          const seed = await testApi.seed("band");
          const { cookie } = await loginAs(USERS.ava.email);
          const session = await apiWithCookie(cookie);
          if (spotifyConnected) await connectSpotify(session);
          if (youtubeConnected) await connectYoutube(session);
          await session.dispose();
          await openSetlistExport(page, testApi, seed, {
            spotify: hasSpotifyLink,
            youtube: hasYoutubeLink,
          });

          const states: [Provider, boolean, boolean][] = [
            ["Spotify", spotifyConnected, hasSpotifyLink],
            ["YouTube", youtubeConnected, hasYoutubeLink],
          ];
          for (const [p, connected, linked] of states) {
            if (!connected) {
              await expect(connectButton(page, p)).toBeVisible();
              await expect(exportButton(page, p)).toHaveCount(0);
              await expect(
                dialog(page).getByTestId(`export-${testId(p)}-no-link`),
              ).toHaveCount(0);
              continue;
            }
            await expect(exportButton(page, p)).toBeEnabled();
            await expect(connectButton(page, p)).toHaveCount(0);
            if (!linked) {
              await exportButton(page, p).click();
              const error = dialog(page).getByTestId(
                `export-${testId(p)}-no-link`,
              );
              await expect(error).toHaveText(`No songs with a ${p} link`);
              await expect(error).toHaveClass(/text-destructive/);
            }
          }

          // Nothing is sent when a connected provider has no linked song.
          expect(await testApi.spotifyCreatedPlaylists()).toEqual([]);
          expect(await testApi.youtubeCreatedPlaylists()).toEqual([]);
          await expect(dialog(page).getByTestId("export-summary")).toHaveCount(
            0,
          );
          // The single skip note appears when some connected export can run.
          const exportable =
            (spotifyConnected && hasSpotifyLink) ||
            (youtubeConnected && hasYoutubeLink);
          await expect(dialog(page).getByTestId("export-note")).toHaveCount(
            exportable ? 1 : 0,
          );
          // Copy stays available under the divider in every state.
          await expect(dialog(page).getByTestId("export-copy")).toBeEnabled();
          await expect(
            dialog(page).getByTestId("export-copy-divider"),
          ).toContainText("or");
        });
      }
    }
  }
}

/** Asserts nothing in the dialog (or the page) extends past the dialog's width. */
async function expectFits(page: Page) {
  const result = await dialog(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const outside = [...el.querySelectorAll("*")]
      .filter((c) => {
        const b = c.getBoundingClientRect();
        return (
          b.width > 0 && (b.right > box.right + 0.5 || b.left < box.left - 0.5)
        );
      })
      .map((c) => c.getAttribute("data-testid") ?? c.tagName);
    return {
      dialogOverflow: el.scrollWidth - el.clientWidth,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      outside,
    };
  });
  expect(result).toEqual({ dialogOverflow: 0, pageOverflow: 0, outside: [] });
}

const LONG_NAME =
  "A very long playlist name for the narrow phone layout ".repeat(2);

test.describe("at 360px width", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("nothing overflows with YouTube connected", async ({
    page,
    testApi,
    loginAs,
  }) => {
    const seed = await testApi.seed("band");
    const { cookie } = await loginAs(USERS.ava.email);
    const session = await apiWithCookie(cookie);
    await connectYoutube(
      session,
      "a.very.long.account.name.for.the.overflow.check@example.com",
    );
    await session.dispose();

    // Spotify not connected, YouTube connected, every button present.
    await openLibrary(page);
    await page.getByRole("button", { name: "Export to Spotify" }).click();
    await expect(exportButton(page, "YouTube")).toBeEnabled();
    await expect(connectButton(page, "Spotify")).toBeVisible();
    await dialog(page)
      .getByLabel("Playlist name")
      .fill(LONG_NAME.slice(0, 100));
    await expectFits(page);

    // Both connected, no linked songs: both red errors showing.
    const spotify = await apiWithCookie(cookie);
    await connectSpotify(spotify);
    await spotify.dispose();
    await openSetlistExport(page, testApi, seed, {
      spotify: false,
      youtube: false,
    });
    await dialog(page)
      .getByLabel("Playlist name")
      .fill(LONG_NAME.slice(0, 100));
    await exportButton(page, "Spotify").click();
    await exportButton(page, "YouTube").click();
    await expect(
      dialog(page).getByTestId("export-spotify-no-link"),
    ).toBeVisible();
    await expect(
      dialog(page).getByTestId("export-youtube-no-link"),
    ).toBeVisible();
    await expectFits(page);

    // The result view with a long playlist name.
    await openLibrary(page);
    await page.getByRole("button", { name: "Export to Spotify" }).click();
    await dialog(page)
      .getByLabel("Playlist name")
      .fill(LONG_NAME.slice(0, 100));
    await exportButton(page, "YouTube").click();
    await expect(dialog(page).getByTestId("export-summary")).toBeVisible();
    await expectFits(page);
  });

  test("nothing overflows with neither provider connected", async ({
    page,
    testApi,
    loginAs,
  }) => {
    await testApi.seed("band");
    await loginAs(USERS.ava.email);
    await openLibrary(page);
    await page.getByRole("button", { name: "Export to Spotify" }).click();
    await expect(connectButton(page, "Spotify")).toBeVisible();
    await expect(connectButton(page, "YouTube")).toBeVisible();
    await dialog(page)
      .getByLabel("Playlist name")
      .fill(LONG_NAME.slice(0, 100));
    await expectFits(page);
  });
});
