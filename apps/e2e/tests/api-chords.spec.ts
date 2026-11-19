import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const FAKE = "https://tabs.ultimate-guitar.com/tab/fake";

async function client(testApi: TestApi, email: string) {
  const { cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return api;
}

async function setup(testApi: TestApi) {
  const api = await client(testApi, "a@example.com");
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const base = `/bands/${band.id}`;
  const mk = async (title: string, artist: string | null = null) => {
    const res = await api.post(`${base}/songs`, { data: { title, artist } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).id as string;
  };
  return { api, bandId: band.id as string, base, chords: `${base}/chords`, mk };
}

test("index, suggest, import, edit, transpose, bulk, delete", async ({
  testApi,
}) => {
  const { api, chords, mk } = await setup(testApi);
  const songId = await mk("Wonderwall", "Fake Band");

  expect(await (await api.get(chords)).json()).toEqual({
    enabled: true,
    songIds: [],
  });

  // suggest picks (4.8, 400) and lists the rest without the official result
  const sug = await (
    await api.post(`${chords}/suggest`, {
      data: { title: "Wonderwall", artist: "Fake Band" },
    })
  ).json();
  expect(sug.match.url).toBe(`${FAKE}/wonderwall-chords-3`);
  expect(sug.versions.map((v: { url: string }) => v.url)).toEqual([
    `${FAKE}/wonderwall-chords-1`,
    `${FAKE}/wonderwall-chords-2`,
  ]);

  const none = await (
    await api.post(`${chords}/suggest`, { data: { title: "Nothing Here" } })
  ).json();
  expect(none).toEqual({ match: null, versions: [] });

  // 404 before a sheet exists
  const missing = await api.get(`${chords}/songs/${songId}`);
  expect(missing.status()).toBe(404);
  expect((await missing.json()).code).toBe("NO_CHORD_SHEET");

  // import: capo 2 page is stored at concert pitch (Em -> F#m)
  const imp = await api.post(`${chords}/songs/${songId}/import`, {
    data: { url: `${FAKE}/wonderwall-chords-3` },
  });
  expect(imp.status(), await imp.text()).toBe(200);
  const sheet = await imp.json();
  expect(sheet).toMatchObject({
    source: "ultimate-guitar",
    sourceUrl: `${FAKE}/wonderwall-chords-3`,
    key: "Em",
    capo: 2,
    editedAt: null,
    bandTranspose: 0,
  });
  expect(sheet.importedAt).toBeTruthy();
  const firstChords = sheet.sheet.lines.find(
    (l: { kind: string; chords?: unknown[] }) =>
      l.kind === "line" && (l.chords?.length ?? 0) > 0,
  );
  expect(firstChords.chords[0].chord.root).toBe("F#");

  expect(await (await api.get(chords)).json()).toEqual({
    enabled: true,
    songIds: [songId],
  });

  // editing an imported sheet sets editedAt
  const saved = await (
    await api.put(`${chords}/songs/${songId}`, {
      data: { text: "[Verse]\nC G\nHello there" },
    })
  ).json();
  expect(saved.source).toBe("ultimate-guitar");
  expect(saved.editedAt).toBeTruthy();

  const bt = await (
    await api.put(`${chords}/songs/${songId}/band-transpose`, {
      data: { semitones: -2 },
    })
  ).json();
  expect(bt.bandTranspose).toBe(-2);

  const bad = await api.put(`${chords}/songs/${songId}/band-transpose`, {
    data: { semitones: 12 },
  });
  expect(bad.status()).toBe(400);

  const other = await mk("Other");
  const bulk = await (
    await api.post(`${chords}/sheets`, {
      data: { songIds: [songId, other] },
    })
  ).json();
  expect(bulk.sheets.map((s: { songId: string }) => s.songId)).toEqual([
    songId,
  ]);

  expect((await api.delete(`${chords}/songs/${songId}`)).status()).toBe(204);
  expect((await api.get(`${chords}/songs/${songId}`)).status()).toBe(404);
  expect(await (await api.get(chords)).json()).toEqual({
    enabled: true,
    songIds: [],
  });
});

test("import errors", async ({ testApi }) => {
  const { api, chords, mk } = await setup(testApi);
  const songId = await mk("Wonderwall");
  const imp = (url: string) =>
    api.post(`${chords}/songs/${songId}/import`, { data: { url } });

  const official = await imp(`${FAKE}/wonderwall-official-1`);
  expect(official.status()).toBe(422);
  expect((await official.json()).code).toBe("UG_OFFICIAL_NOT_SUPPORTED");

  const broken = await imp(`${FAKE}/broken-1`);
  expect(broken.status()).toBe(502);
  expect((await broken.json()).code).toBe("UG_IMPORT_FAILED");

  const invalid = await imp("https://example.com/tab");
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe("UG_INVALID_LINK");
});

test("PUT text creates a manual sheet and empty text is rejected", async ({
  testApi,
}) => {
  const { api, chords, mk } = await setup(testApi);
  const songId = await mk("My Song");
  const res = await api.put(`${chords}/songs/${songId}`, {
    data: { text: "[Verse]\nAm F\nSome words here" },
  });
  expect(res.status(), await res.text()).toBe(200);
  const sheet = await res.json();
  expect(sheet).toMatchObject({
    source: "manual",
    sourceUrl: null,
    editedAt: null,
  });

  const empty = await api.put(`${chords}/songs/${songId}`, {
    data: { text: "   " },
  });
  expect(empty.status()).toBe(400);
});

test("non-members get 404", async ({ testApi }) => {
  const { chords, mk } = await setup(testApi);
  const songId = await mk("Wonderwall");
  const outsider = await client(testApi, "z@example.com");
  expect((await outsider.get(chords)).status()).toBe(404);
  expect((await outsider.get(`${chords}/songs/${songId}`)).status()).toBe(404);
});

test("cross-band access, deleted songs and evil links", async ({ testApi }) => {
  const a = await setup(testApi);
  const songId = await a.mk("Wonderwall");
  expect(
    (
      await a.api.put(`${a.chords}/songs/${songId}`, {
        data: { text: "[Verse]\nAm F\nwords here" },
      })
    ).status(),
  ).toBe(200);

  // a member of another band cannot touch band A's sheet through their own band
  const b = await client(testApi, "b@example.com");
  const bBand = await (
    await b.post("/bands", { data: { name: "Other Band" } })
  ).json();
  const bChords = `/bands/${bBand.id}/chords`;
  expect((await b.get(`${bChords}/songs/${songId}`)).status()).toBe(404);
  expect(
    (
      await b.put(`${bChords}/songs/${songId}`, { data: { text: "Am\nhi" } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await b.post(`${bChords}/songs/${songId}/import`, {
        data: { url: `${FAKE}/wonderwall-chords-3` },
      })
    ).status(),
  ).toBe(404);
  expect((await b.delete(`${bChords}/songs/${songId}`)).status()).toBe(404);
  // and not through band A's routes either
  expect((await b.get(`${a.chords}/songs/${songId}`)).status()).toBe(404);

  // soft-deleted song -> 404
  expect((await a.api.delete(`${a.base}/songs/${songId}`)).status()).toBe(200);
  expect((await a.api.get(`${a.chords}/songs/${songId}`)).status()).toBe(404);

  const live = await a.mk("Live");
  for (const url of [
    "https://evil.com",
    "https://ultimate-guitar.com.evil.com",
  ]) {
    const res = await a.api.post(`${a.chords}/songs/${live}/import`, {
      data: { url },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("UG_INVALID_LINK");
  }
});
