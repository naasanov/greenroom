import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { RealSpotifyAdapter } from "./spotify.real.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const redirect = (location: string, status = 302): Response =>
  new Response(null, { status, headers: { location } });

/** Serves the queued responses in order and records each requested URL and redirect mode. */
function stubFetch(responses: Response[]): {
  urls: string[];
  modes: unknown[];
} {
  const seen = { urls: [] as string[], modes: [] as unknown[] };
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    seen.urls.push(String(url));
    seen.modes.push(init?.redirect);
    const next = responses.shift();
    assert.ok(next, "unexpected extra fetch");
    return next;
  }) as typeof fetch;
  return seen;
}

test("resolveShortLink follows the redirect to the track id", async () => {
  const seen = stubFetch([
    redirect("https://open.spotify.com/intl-de/track/abc123?si=x"),
  ]);
  const id = await new RealSpotifyAdapter().resolveShortLink(
    "https://spotify.link/AbCdEf",
  );
  assert.equal(id, "abc123");
  assert.deepEqual(seen.modes, ["manual"]);
});

test("resolveShortLink follows a relative redirect within spotify.link", async () => {
  stubFetch([
    redirect("/second"),
    redirect("https://open.spotify.com/track/abc123"),
  ]);
  const id = await new RealSpotifyAdapter().resolveShortLink(
    "https://spotify.link/first",
  );
  assert.equal(id, "abc123");
});

test("resolveShortLink never requests a host outside the allowlist", async () => {
  for (const target of [
    "https://evil.example.com/track/abc123",
    "http://spotify.link/insecure",
    "https://spotify.link:8443/port",
    "https://user:pw@spotify.link/creds",
    "https://169.254.169.254/latest/meta-data",
  ]) {
    const seen = stubFetch([redirect(target)]);
    const id = await new RealSpotifyAdapter().resolveShortLink(
      "https://spotify.link/AbCdEf",
    );
    assert.equal(id, null, target);
    assert.deepEqual(seen.urls, ["https://spotify.link/AbCdEf"], target);
  }
});

test("resolveShortLink refuses to start from other hosts", async () => {
  const seen = stubFetch([]);
  for (const url of [
    "https://evil.example.com/AbCdEf",
    "http://spotify.link/AbCdEf",
    "https://spotify.link.evil.example/AbCdEf",
    "not a url",
  ]) {
    assert.equal(await new RealSpotifyAdapter().resolveShortLink(url), null);
  }
  assert.deepEqual(seen.urls, []);
});

test("resolveShortLink gives up after a few redirects and on non-redirects", async () => {
  const loop = Array.from({ length: 10 }, () =>
    redirect("https://spotify.link/again"),
  );
  const seen = stubFetch(loop);
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/a"),
    null,
  );
  assert.ok(seen.urls.length <= 5, `made ${seen.urls.length} requests`);

  stubFetch([new Response("<html></html>", { status: 200 })]);
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/b"),
    null,
  );
});

test("resolveShortLink returns null for non-track targets", async () => {
  stubFetch([redirect("https://open.spotify.com/playlist/xyz")]);
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/p"),
    null,
  );
});

test("resolveShortLink returns null for a malformed Location", async () => {
  stubFetch([redirect("http://[bad")]);
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/m"),
    null,
  );
});

test("resolveShortLink returns null when fetch throws", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("network down");
  }) as typeof fetch;
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/n"),
    null,
  );
  globalThis.fetch = (async () => {
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch;
  assert.equal(
    await new RealSpotifyAdapter().resolveShortLink("https://spotify.link/o"),
    null,
  );
});
