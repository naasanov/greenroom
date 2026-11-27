import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { RealYoutubeAdapter } from "./youtube.real.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });
const apiError = (status: number, reason: string): Response =>
  reply(status, { error: { errors: [{ reason }] } });

function stubFetch(responses: Response[]): {
  urls: string[];
  bodies: unknown[];
} {
  const seen = { urls: [] as string[], bodies: [] as unknown[] };
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    seen.urls.push(String(url));
    seen.bodies.push(JSON.parse(String(init?.body ?? "null")));
    const next = responses.shift();
    assert.ok(next, "unexpected extra fetch");
    return next;
  }) as typeof fetch;
  return seen;
}

test("createPlaylist posts a private playlist and returns its URL", async () => {
  const seen = stubFetch([reply(200, { id: "PLabc123" })]);
  const res = await new RealYoutubeAdapter().createPlaylist("tok", {
    name: "Setlist",
  });
  assert.deepEqual(res, {
    status: "ok",
    playlist: {
      id: "PLabc123",
      url: "https://www.youtube.com/playlist?list=PLabc123",
      name: "Setlist",
    },
  });
  assert.match(seen.urls[0]!, /\/youtube\/v3\/playlists\?/);
  assert.deepEqual(seen.bodies[0], {
    snippet: { title: "Setlist", description: "" },
    status: { privacyStatus: "private" },
  });
});

test("createPlaylist maps quota, missing channel and auth failures", async () => {
  const adapter = new RealYoutubeAdapter();
  stubFetch([apiError(403, "quotaExceeded")]);
  assert.deepEqual(await adapter.createPlaylist("t", { name: "x" }), {
    status: "quota-exceeded",
  });
  stubFetch([apiError(401, "youtubeSignupRequired")]);
  assert.deepEqual(await adapter.createPlaylist("t", { name: "x" }), {
    status: "no-channel",
  });
  stubFetch([apiError(401, "authError")]);
  assert.deepEqual(await adapter.createPlaylist("t", { name: "x" }), {
    status: "unauthorized",
  });
});

test("createPlaylist rejects a response without a plausible playlist id", async () => {
  stubFetch([reply(200, { id: "bad id!" })]);
  await assert.rejects(
    new RealYoutubeAdapter().createPlaylist("t", { name: "x" }),
  );
});

test("addPlaylistItems adds in order and separates refused videos", async () => {
  const seen = stubFetch([
    reply(200, {}),
    apiError(404, "videoNotFound"),
    reply(200, {}),
  ]);
  const res = await new RealYoutubeAdapter().addPlaylistItems("t", "PL1", [
    "aaaaaaaaaaa",
    "bbbbbbbbbbb",
    "ccccccccccc",
  ]);
  assert.deepEqual(res, {
    status: "ok",
    added: ["aaaaaaaaaaa", "ccccccccccc"],
    rejected: ["bbbbbbbbbbb"],
  });
  assert.equal(seen.urls.length, 3);
  assert.deepEqual(seen.bodies[0], {
    snippet: {
      playlistId: "PL1",
      resourceId: { kind: "youtube#video", videoId: "aaaaaaaaaaa" },
    },
  });
});

test("addPlaylistItems stops at quota exhaustion", async () => {
  const seen = stubFetch([reply(200, {}), apiError(403, "quotaExceeded")]);
  const res = await new RealYoutubeAdapter().addPlaylistItems("t", "PL1", [
    "aaaaaaaaaaa",
    "bbbbbbbbbbb",
    "ccccccccccc",
  ]);
  assert.deepEqual(res, { status: "quota-exceeded" });
  assert.equal(seen.urls.length, 2);
});
