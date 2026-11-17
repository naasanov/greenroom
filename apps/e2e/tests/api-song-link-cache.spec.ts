import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const SRC = "https://open.spotify.com/track/cache1";
const YT = "https://www.youtube.com/watch?v=one";
const YT2 = "https://www.youtube.com/watch?v=two";

/** A signed-in band admin and a bound `ask` for suggest-references. */
async function setup(testApi: TestApi) {
  const { cookie } = await testApi.login("a@example.com");
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const url = `/bands/${band.id}/songs/suggest-references`;
  const ask = async (sourceUrl: string, title?: string) => {
    const res = await api.post(url, {
      data: title === undefined ? { sourceUrl } : { title, sourceUrl },
    });
    expect(res.status(), await res.text()).toBe(200);
    return (
      (await res.json()) as { suggestions: { value: string }[] }
    ).suggestions.map((s) => s.value);
  };
  const calls = async () => (await testApi.suggestionCalls()).musiclink;
  return { api, ask, calls };
}

test("a second lookup is served without calling MusicLink, from memory or the table", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  expect(await ask(SRC)).toEqual([YT]);
  expect(await calls()).toEqual([SRC]);
  expect((await testApi.linkCacheRow(SRC))?.links).toEqual({ youtube: YT });

  expect(await ask(SRC)).toEqual([YT]);
  // With the in-memory layer dropped, the stored row answers.
  await testApi.clearSuggestionMemory();
  expect(await ask(SRC)).toEqual([YT]);
  expect(await calls()).toEqual([SRC]);
  await api.dispose();
});

test("tracking noise in the URL hits the same row", async ({ testApi }) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  expect(await ask(`${SRC}?si=abc`)).toEqual([YT]);
  await testApi.clearSuggestionMemory();
  expect(
    await ask(`https://OPEN.spotify.com/track/cache1/?si=other#frag`),
  ).toEqual([YT]);
  expect(await ask(SRC)).toEqual([YT]);
  expect(await calls()).toEqual([SRC]);
  expect(await testApi.linkCacheRow(`${SRC}?si=abc`)).toEqual(
    await testApi.linkCacheRow(SRC),
  );
  await api.dispose();
});

test("a row with links is fresh at 29 days and refetched at 31", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  await ask(SRC);
  expect(await testApi.ageLinkCache(SRC, 29)).toBe(true);
  expect(await ask(SRC)).toEqual([YT]);
  expect(await calls()).toHaveLength(1);

  await testApi.seedMusicLink(SRC, { youtube: YT2 });
  await testApi.ageLinkCache(SRC, 2);
  expect(await ask(SRC)).toEqual([YT2]);
  expect(await calls()).toHaveLength(2);
  expect((await testApi.linkCacheRow(SRC))?.links).toEqual({ youtube: YT2 });
  await api.dispose();
});

test("a stale row is served and left untouched when the refetch fails", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  await ask(SRC);
  await testApi.ageLinkCache(SRC, 31);
  const before = await testApi.linkCacheRow(SRC);

  await testApi.failSuggestions({ musiclink: true });
  expect(await ask(SRC)).toEqual([YT]);
  // The failing fake was reached, and the old row is unchanged.
  expect(await calls()).toHaveLength(2);
  expect(await testApi.linkCacheRow(SRC)).toEqual(before);
  await api.dispose();
});

test("a failed first lookup stores nothing", async ({ testApi }) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.failSuggestions({ musiclink: true });
  expect(await ask(SRC)).toEqual([]);
  expect(await calls()).toEqual([SRC]);
  expect(await testApi.linkCacheRow(SRC)).toBeNull();
  await api.dispose();
});

test("an empty result is stored, fresh at 6 days and refetched at 8", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  expect(await ask(SRC)).toEqual([]);
  expect((await testApi.linkCacheRow(SRC))?.links).toEqual({});

  await testApi.ageLinkCache(SRC, 6);
  expect(await ask(SRC)).toEqual([]);
  expect(await calls()).toHaveLength(1);

  await testApi.seedMusicLink(SRC, { youtube: YT });
  await testApi.ageLinkCache(SRC, 2);
  expect(await ask(SRC)).toEqual([YT]);
  expect(await calls()).toHaveLength(2);
  await api.dispose();
});

test("sources outside the allowlist never reach MusicLink or the table", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  const rejected = [
    "http://open.spotify.com/track/cache1",
    "https://drive.google.com/file/d/abc/view",
    "https://genius.com/some-lyrics",
    "https://example.com/chart",
    "https://open.spotify.com.evil.test/track/cache1",
    "not a url",
  ];
  for (const url of rejected) expect(await ask(url)).toEqual([]);
  expect(await calls()).toEqual([]);
  expect(await testApi.linkCacheRow(rejected[0]!)).toBeNull();
  await api.dispose();
});

test("a missing or empty title is accepted when a source link is given", async ({
  testApi,
}) => {
  const { api, ask } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  expect(await ask(SRC)).toEqual([YT]);
  expect(await ask(SRC, "")).toEqual([YT]);
  await api.dispose();
});

test("concurrent duplicate lookups make one MusicLink call", async ({
  testApi,
}) => {
  const { api, ask, calls } = await setup(testApi);
  await testApi.seedMusicLink(SRC, { youtube: YT });
  const results = await Promise.all(
    [SRC, `${SRC}?si=a`, `${SRC}?si=b`, SRC, SRC].map((u) => ask(u)),
  );
  for (const r of results) expect(r).toEqual([YT]);
  expect(await calls()).toEqual([SRC]);
  await api.dispose();
});
