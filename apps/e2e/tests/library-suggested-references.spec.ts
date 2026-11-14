import type { Page } from "@playwright/test";
import { BANDS, USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import {
  apiAs,
  cards,
  fabAction,
  openLibrary,
  sheet,
} from "./library-helpers.js";

const SPOTIFY_URL = "https://open.spotify.com/track/fakeTrack3";
const base = `/bands/${BANDS.nightOwls.id}/songs`;
const chips = (page: Page) => sheet(page).getByTestId("suggestion-chip");
const chip = (page: Page, label: string) =>
  chips(page).filter({ hasText: new RegExp(`^${label}$`) });

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

/** Opens the add form prefilled from the Spotify fake's "Take Me Out". */
async function addFromSpotify(page: Page) {
  await openLibrary(page);
  await fabAction(page, "add-song");
  await sheet(page)
    .getByRole("textbox", { name: "Song link or search" })
    .fill(SPOTIFY_URL);
  await sheet(page).getByTestId("candidate").first().click();
  await sheet(page)
    .getByTestId("candidate-preview")
    .getByRole("button", { name: "Use this song" })
    .click();
  await expect(sheet(page).getByLabel("Title")).toHaveValue("Take Me Out");
}

async function seedAll(testApi: {
  seedOdesli: (u: string, l: Record<string, string>) => Promise<void>;
  seedSongsterr: (t: {
    title: string;
    artist: string;
    bass?: string;
    guitar?: string;
  }) => Promise<void>;
}) {
  await testApi.seedOdesli(SPOTIFY_URL, {
    spotify: SPOTIFY_URL,
    youtubeMusic: "https://music.youtube.com/watch?v=tmo",
    youtube: "https://www.youtube.com/watch?v=tmo",
    appleMusic: "https://music.apple.com/us/song/tmo",
    tidal: "https://tidal.com/track/1",
    deezer: "https://deezer.com/track/1",
  });
  await testApi.seedSongsterr({
    title: "Take Me Out",
    artist: "Franz Ferdinand",
    bass: "https://www.songsterr.com/a/wsa/ff-take-me-out-bass-tab-s9t1",
    guitar: "https://www.songsterr.com/a/wsa/ff-take-me-out-tab-s9t0",
  });
}

test("add mode: chips sit below the link list, show label and icon only, tap adds a row", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  await addFromSpotify(page);
  const s = sheet(page);
  // Spotify is already a row, so it has no chip; tidal and deezer are not whitelisted.
  await expect(chips(page)).toHaveText([
    "YouTube Music",
    "YouTube",
    "Apple Music",
    "Bass tabs",
  ]);
  const lastRow = await s.getByTestId("link-row").last().boundingBox();
  const row = await chips(page).first().boundingBox();
  expect(row!.y).toBeGreaterThan(lastRow!.y + lastRow!.height - 1);
  // The URL is never shown.
  await expect(s.getByTestId("suggestion-chips")).not.toContainText("http");

  await chip(page, "Apple Music").click();
  await expect(chip(page, "Apple Music")).toHaveCount(0);
  const rows = s.getByTestId("link-row");
  await expect(rows).toHaveCount(2);
  await expect(
    rows.last().getByRole("combobox", { name: "Reference label" }),
  ).toHaveValue("Apple Music");
  await expect(
    rows.last().getByRole("textbox", { name: "Reference value" }),
  ).toHaveValue("https://music.apple.com/us/song/tmo");
});

test("tab chips read Bass tabs and Guitar tabs with the Songsterr icon and no service name", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  await testApi.seedOdesli(SPOTIFY_URL, {});
  await addFromSpotify(page);
  await expect(chips(page)).toHaveText(["Bass tabs", "Guitar tabs"]);
  await expect(chips(page).locator('[data-icon="songsterr"]')).toHaveCount(2);
  await expect(sheet(page)).not.toContainText(/songsterr/i);
  await chip(page, "Guitar tabs").click();
  await expect(
    sheet(page)
      .getByTestId("link-row")
      .last()
      .getByRole("textbox", { name: "Reference value" }),
  ).toHaveValue("https://www.songsterr.com/a/wsa/ff-take-me-out-tab-s9t0");
  await expect(sheet(page)).not.toContainText(/songsterr/i);
});

test("edit mode shows chips and hides references the song already has", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  const api = await apiAs(testApi, USERS.ava.email);
  const created = await (
    await api.post(base, {
      data: {
        title: "Take Me Out",
        artist: "Franz Ferdinand",
        references: [
          { label: "Spotify", value: SPOTIFY_URL },
          { label: "youtube", value: "https://youtu.be/elsewhere" },
        ],
      },
    })
  ).json();
  expect(created.references).toHaveLength(2);
  await openLibrary(page);
  await cards(page).filter({ hasText: "Take Me Out" }).click();
  await sheet(page).getByRole("button", { name: "Edit" }).click();
  // No Spotify chip (row exists) and no YouTube chip (label matches a row).
  await expect(chips(page)).toHaveText([
    "YouTube Music",
    "Apple Music",
    "Bass tabs",
    "Guitar tabs",
  ]);
  await chip(page, "Bass tabs").click();
  await expect(sheet(page).getByTestId("link-row")).toHaveCount(3);
  await expect(chips(page)).toHaveText([
    "YouTube Music",
    "Apple Music",
    "Guitar tabs",
  ]);
  // Nothing is saved until the form is.
  const stored = await (await api.get(`${base}/${created.id}`)).json();
  expect(stored.references).toHaveLength(2);
});

test("no match or failed lookups show no chip and no error, and saving still works", async ({
  page,
  testApi,
}) => {
  await addFromSpotify(page);
  // Nothing seeded for this link: Odesli's empty result is a non-match.
  await expect(sheet(page).getByTestId("link-row")).toHaveCount(1);
  await expect(chips(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await sheet(page).getByLabel("Title").fill("Take Me Out Again");

  await testApi.failSuggestions({ odesli: true, songsterr: true });
  await sheet(page).getByLabel("Title").fill("Take Me Out Once More");
  await page.waitForTimeout(900);
  await expect(chips(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
});

test("ranking: used labels first, fixed order next, capped at four, next chip appears on add", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  const api = await apiAs(testApi, USERS.ava.email);
  await api.post(base, {
    data: {
      title: "Other Song",
      references: [
        { label: "Guitar tabs", value: "https://x.test/g" },
        { label: "YouTube", value: "https://x.test/y" },
      ],
    },
  });
  await addFromSpotify(page);
  // Used first (YouTube, Guitar tabs), then never-used in fixed order; Bass tabs is cut.
  await expect(chips(page)).toHaveText([
    "YouTube",
    "Guitar tabs",
    "YouTube Music",
    "Apple Music",
  ]);
  const boxes = await chips(page).evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  expect(new Set(boxes).size).toBe(1);

  await chip(page, "YouTube").click();
  await expect(chips(page)).toHaveText([
    "Guitar tabs",
    "YouTube Music",
    "Apple Music",
    "Bass tabs",
  ]);
  // Rerendering on a title edit keeps the order.
  await sheet(page).getByLabel("Artist").fill("Franz Ferdinand");
  await expect(chips(page)).toHaveText([
    "Guitar tabs",
    "YouTube Music",
    "Apple Music",
    "Bass tabs",
  ]);
});

test("odesli resolves through the real adapter: empty page URL is no match, failures are silent", async () => {
  const mod = (await import(
    new URL(
      "../../api/dist/integrations/odesli/odesli.real.js",
      import.meta.url,
    ).href
  )) as {
    RealOdesliAdapter: new () => {
      findLinks(url: string): Promise<Record<string, string> | null>;
    };
  };
  const adapter = new mod.RealOdesliAdapter();
  const real = globalThis.fetch;
  const reply = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });
  try {
    globalThis.fetch = reply(200, { pageUrl: "", linksByPlatform: {} });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({});

    globalThis.fetch = reply(200, {
      pageUrl: "https://song.link/s/1",
      linksByPlatform: {
        spotify: { url: "https://open.spotify.com/track/1" },
        tidal: { url: "https://tidal.com/track/1" },
      },
    });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      spotify: "https://open.spotify.com/track/1",
    });

    globalThis.fetch = reply(429, {});
    expect(await adapter.findLinks("https://x.test/a")).toBeNull();
    globalThis.fetch = reply(200, ["nope"]);
    expect(await adapter.findLinks("https://x.test/a")).toBeNull();
  } finally {
    globalThis.fetch = real;
  }
});

test("songsterr real adapter: bass and guitar only when the track exists, bad payloads are silent", async () => {
  const mod = (await import(
    new URL(
      "../../api/dist/integrations/songsterr/songsterr.real.js",
      import.meta.url,
    ).href
  )) as {
    RealSongsterrAdapter: new () => {
      findTabs(i: {
        title: string;
        artist?: string;
      }): Promise<{ bass?: string; guitar?: string } | null>;
    };
  };
  const adapter = new mod.RealSongsterrAdapter();
  const real = globalThis.fetch;
  const reply = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });
  try {
    globalThis.fetch = reply(200, [
      {
        songId: 7,
        title: "Hey",
        artist: "Band",
        tracks: [{ instrument: "Distortion Guitar" }, { instrument: "Drums" }],
      },
    ]);
    const tabs = await adapter.findTabs({ title: "Hey", artist: "Band" });
    expect(tabs?.guitar).toContain("-tab-s7t0");
    expect(tabs?.bass).toBeUndefined();

    globalThis.fetch = reply(500, {});
    expect(await adapter.findTabs({ title: "Hey" })).toBeNull();
    globalThis.fetch = reply(200, { not: "an array" });
    expect(await adapter.findTabs({ title: "Hey" })).toBeNull();
    globalThis.fetch = async () => {
      throw new Error("timeout");
    };
    expect(await adapter.findTabs({ title: "Hey" })).toBeNull();
  } finally {
    globalThis.fetch = real;
  }
});
