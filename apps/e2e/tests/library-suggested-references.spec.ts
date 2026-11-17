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
  seedMusicLink: (u: string, l: Record<string, string>) => Promise<void>;
}) {
  await testApi.seedMusicLink(SPOTIFY_URL, {
    spotify: SPOTIFY_URL,
    youtube_music: "https://music.youtube.com/watch?v=tmo",
    youtube: "https://www.youtube.com/watch?v=tmo",
    apple_music: "https://music.apple.com/us/song/tmo",
    tidal: "https://tidal.com/track/1",
    deezer: "https://deezer.com/track/1",
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
  await expect(chips(page)).toHaveText(["YouTube Music", "Apple Music"]);
  await chip(page, "YouTube Music").click();
  await expect(sheet(page).getByTestId("link-row")).toHaveCount(3);
  await expect(chips(page)).toHaveText(["Apple Music"]);
  // Nothing is saved until the form is.
  const stored = await (await api.get(`${base}/${created.id}`)).json();
  expect(stored.references).toHaveLength(2);
});

test("no match shows no chip and no error, and saving still works", async ({
  page,
  testApi,
}) => {
  await addFromSpotify(page);
  // Nothing seeded for this link: MusicLink's empty result is a non-match.
  await expect
    .poll(async () => (await testApi.suggestionCalls()).musiclink)
    .toEqual([SPOTIFY_URL]);
  await expect(sheet(page).getByTestId("link-row")).toHaveCount(1);
  await expect(chips(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
});

test("a failing lookup shows no chip and no error, and saving still works", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  await testApi.failSuggestions({ musiclink: true });
  await addFromSpotify(page);
  // The failing fake was reached, so the silence comes from the failure path.
  await expect
    .poll(async () => (await testApi.suggestionCalls()).musiclink)
    .toEqual([SPOTIFY_URL]);
  await expect(chips(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  expect(await testApi.linkCacheRow(SPOTIFY_URL)).toBeNull();
  await sheet(page).getByLabel("Title").fill("Take Me Out Once More");
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
});

test("ranking: used labels first, fixed order next, four chips in one row, next chip order holds", async ({
  page,
  testApi,
}) => {
  // youtu.be differs from the suggested YouTube host, so all four chips stay.
  const source = "https://youtu.be/rankvid1";
  await testApi.seedMusicLink(source, {
    spotify: "https://open.spotify.com/track/rank",
    youtube_music: "https://music.youtube.com/watch?v=rank",
    youtube: "https://www.youtube.com/watch?v=rank",
    apple_music: "https://music.apple.com/us/song/rank",
  });
  const api = await apiAs(testApi, USERS.ava.email);
  await api.post(base, {
    data: {
      title: "Other Song",
      references: [
        { label: "Apple Music", value: "https://x.test/a" },
        { label: "YouTube", value: "https://x.test/y" },
      ],
    },
  });
  await api.post(base, {
    data: {
      title: "Ranked Song",
      references: [{ label: "Chart", value: source }],
    },
  });
  await openLibrary(page);
  await cards(page).filter({ hasText: "Ranked Song" }).click();
  await sheet(page).getByRole("button", { name: "Edit" }).click();
  // Used first (YouTube, Apple Music in whitelist order), then the rest in fixed order.
  await expect(chips(page)).toHaveText([
    "YouTube",
    "Apple Music",
    "Spotify",
    "YouTube Music",
  ]);
  const tops = await chips(page).evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
  // Every chip is inside the row's visible box, or the row scrolls sideways.
  const geo = await page.getByTestId("suggestion-chips").evaluate((row) => {
    const box = row.getBoundingClientRect();
    return {
      scrollable: row.scrollWidth > row.clientWidth,
      left: box.left,
      right: box.right,
      chips: [...row.children].map((c) => {
        const b = c.getBoundingClientRect();
        return { left: b.left, right: b.right };
      }),
    };
  });
  expect(
    geo.scrollable ||
      geo.chips.every(
        (c) => c.left >= geo.left - 1 && c.right <= geo.right + 1,
      ),
  ).toBe(true);

  await chip(page, "YouTube").click();
  await expect(chips(page)).toHaveText([
    "Apple Music",
    "Spotify",
    "YouTube Music",
  ]);
  // Title and artist edits neither reorder the chips nor trigger a new lookup.
  await sheet(page).getByLabel("Artist").fill("Franz Ferdinand");
  await sheet(page).getByLabel("Title").fill("Ranked Song Two");
  await page.waitForTimeout(900);
  await expect(chips(page)).toHaveText([
    "Apple Music",
    "Spotify",
    "YouTube Music",
  ]);
  expect((await testApi.suggestionCalls()).musiclink).toEqual([source]);
});

test("a rate-limited MusicLink backs off: no chips, no error, no further lookups", async ({
  page,
  testApi,
}) => {
  await seedAll(testApi);
  await testApi.failSuggestions({ musiclink: true, retryAfterSeconds: 600 });
  await addFromSpotify(page);
  await page.waitForTimeout(900);
  await expect(chips(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(1);
  await sheet(page).getByLabel("Title").fill("Another Title");
  await page.waitForTimeout(900);
  expect((await testApi.suggestionCalls()).musiclink).toHaveLength(1);
});

type RealAdapter = {
  findLinks(url: string): Promise<{
    links: Record<string, string> | null;
    retryAfterSeconds?: number;
  }>;
};

async function realAdapter(): Promise<RealAdapter> {
  const mod = (await import(
    new URL(
      "../../api/dist/integrations/musiclink/musiclink.real.js",
      import.meta.url,
    ).href
  )) as { RealMusicLinkAdapter: new () => RealAdapter };
  return new mod.RealMusicLinkAdapter();
}

test("musiclink real adapter: first track item, whitelisted https platforms only, 404 and empty data are no match", async () => {
  const adapter = await realAdapter();
  const real = globalThis.fetch;
  const priorKey = process.env.MUSICLINK_API_KEY;
  process.env.MUSICLINK_API_KEY = "test-key";
  const reply = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });
  try {
    let seen: { url: string; auth: string | null } | null = null;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      seen = {
        url: String(input),
        auth: new Headers(init?.headers).get("authorization"),
      };
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            { type: "album", platforms: { spotify: "https://wrong.test/a" } },
            {
              type: "track",
              title: "T",
              artist: "A",
              isrc: "X",
              platforms: {
                musiclink: "https://musiclink.one/x",
                spotify: "https://open.spotify.com/track/1",
                youtube_music: "https://music.youtube.com/watch?v=1",
                youtube: null,
                apple_music: "http://music.apple.com/insecure",
                deezer: "https://deezer.com/track/1",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const source = "https://open.spotify.com/track/1?si=a b";
    expect(await adapter.findLinks(source)).toEqual({
      links: {
        spotify: "https://open.spotify.com/track/1",
        youtube_music: "https://music.youtube.com/watch?v=1",
      },
    });
    expect(seen).toEqual({
      url: `https://api.musiclink.one/v2/resolve?${new URLSearchParams({ q: source })}`,
      auth: "Bearer test-key",
    });

    globalThis.fetch = reply(200, { success: true, data: [] });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({ links: {} });
    globalThis.fetch = reply(404, { success: false });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({ links: {} });
  } finally {
    globalThis.fetch = real;
    if (priorKey === undefined) delete process.env.MUSICLINK_API_KEY;
    else process.env.MUSICLINK_API_KEY = priorKey;
  }
});

test("musiclink real adapter: 429, other non-2xx, bad payloads and timeouts are silent; no key means no request", async () => {
  const adapter = await realAdapter();
  const real = globalThis.fetch;
  const priorKey = process.env.MUSICLINK_API_KEY;
  process.env.MUSICLINK_API_KEY = "test-key";
  let calls = 0;
  const reply =
    (status: number, body: unknown, headers?: Record<string, string>) =>
    async () => {
      calls++;
      return new Response(JSON.stringify(body), { status, headers });
    };
  try {
    globalThis.fetch = reply(429, {}, { "retry-after": "90" });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
      retryAfterSeconds: 90,
    });
    globalThis.fetch = reply(429, {});
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });
    globalThis.fetch = reply(500, {});
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });
    globalThis.fetch = reply(200, ["nope"]);
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });
    globalThis.fetch = reply(200, { success: true, data: "nope" });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });
    globalThis.fetch = async () => {
      throw new Error("timeout");
    };
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });

    delete process.env.MUSICLINK_API_KEY;
    calls = 0;
    globalThis.fetch = reply(200, { success: true, data: [] });
    expect(await adapter.findLinks("https://x.test/a")).toEqual({
      links: null,
    });
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = real;
    if (priorKey === undefined) delete process.env.MUSICLINK_API_KEY;
    else process.env.MUSICLINK_API_KEY = priorKey;
  }
});

test("references-only editing shows chips, and a tap saves through Done", async ({
  page,
  testApi,
}) => {
  const source = "https://youtu.be/refonly1";
  await testApi.seedMusicLink(source, {
    spotify: "https://open.spotify.com/track/refonly",
    apple_music: "https://music.apple.com/us/song/refonly",
  });
  const api = await apiAs(testApi, USERS.ava.email);
  await api.post(base, {
    data: {
      title: "Ref Only Song",
      references: [{ label: "Chart", value: source }],
    },
  });
  await openLibrary(page);
  await cards(page).filter({ hasText: "Ref Only Song" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Change references" }).click();
  await expect(chips(page)).toHaveText(["Spotify", "Apple Music"]);
  await chip(page, "Spotify").click();
  await s.getByRole("button", { name: "Done" }).click();
  await expect(s.getByTestId("references-edit")).toHaveCount(0);
  await expect(s.getByText("open.spotify.com")).toBeVisible();
});
