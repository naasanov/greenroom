import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bodySnippet,
  httpFailure,
  httpRequest,
  parseRetryAfterSeconds,
  type HttpOptions,
} from "./http.js";

type Step = Response | Error | (() => Promise<Response>);

/** Fake fetch that plays the given steps in order and records each call. */
function script(...steps: Step[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const waits: number[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error("fetch called more often than scripted");
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step() : step;
  }) as typeof fetch;
  const opts = (extra: Partial<HttpOptions> = {}): HttpOptions => ({
    timeoutMs: 1000,
    fetchImpl,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    now: () => NOW,
    ...extra,
  });
  return { calls, waits, opts };
}

const NOW = Date.parse("2026-01-01T00:00:00Z");
const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response("body", { status, headers });

describe("parseRetryAfterSeconds", () => {
  it("reads delta-seconds, including fractions and zero", () => {
    assert.equal(parseRetryAfterSeconds("3", NOW), 3);
    assert.equal(parseRetryAfterSeconds(" 1.5 ", NOW), 1.5);
    assert.equal(parseRetryAfterSeconds("0", NOW), 0);
  });
  it("reads an HTTP-date relative to now and floors past dates at zero", () => {
    assert.equal(
      parseRetryAfterSeconds("Thu, 01 Jan 2026 00:00:07 GMT", NOW),
      7,
    );
    assert.equal(
      parseRetryAfterSeconds("Wed, 31 Dec 2025 23:00:00 GMT", NOW),
      0,
    );
  });
  it("returns undefined for missing or unusable values", () => {
    assert.equal(parseRetryAfterSeconds(null, NOW), undefined);
    assert.equal(parseRetryAfterSeconds("", NOW), undefined);
    assert.equal(parseRetryAfterSeconds("soon", NOW), undefined);
  });
});

describe("httpRequest", () => {
  it("returns a success without retrying or waiting", async () => {
    const s = script(reply(200));
    const res = await httpRequest("http://x/a", {}, s.opts({ maxRetries: 2 }));
    assert.equal(res.status, 200);
    assert.equal(s.calls.length, 1);
    assert.deepEqual(s.waits, []);
  });

  it("attaches a fresh abort signal to every attempt", async () => {
    const s = script(reply(503), reply(200));
    await httpRequest("http://x/a", {}, s.opts({ maxRetries: 1 }));
    const [a, b] = s.calls.map((c) => c.init?.signal);
    assert.ok(a && b && a !== b);
  });

  it("times out a hung request", async () => {
    // Settles only when the abort signal fires; the ref'd timer keeps the loop alive
    // because AbortSignal.timeout's own timer is unref'd.
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const keepAlive = setTimeout(() => undefined, 5000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        });
      })) as typeof fetch;
    await assert.rejects(
      httpRequest("http://x/a", {}, { timeoutMs: 20, fetchImpl }),
      (err: Error) => err.name === "TimeoutError",
    );
  });

  it("does not retry network errors", async () => {
    const s = script(new Error("boom"));
    await assert.rejects(
      httpRequest("http://x/a", {}, s.opts({ maxRetries: 2 })),
      /boom/,
    );
    assert.equal(s.calls.length, 1);
  });

  it("retries 429 and 5xx up to maxRetries with exponential backoff", async () => {
    const s = script(reply(429), reply(503), reply(500), reply(502));
    const res = await httpRequest(
      "http://x/a",
      {},
      s.opts({ maxRetries: 3, fallbackDelayMs: 100, maxDelayMs: 10_000 }),
    );
    assert.equal(res.status, 502);
    assert.equal(s.calls.length, 4);
    assert.deepEqual(s.waits, [100, 200, 400]);
  });

  it("recovers when a retry succeeds", async () => {
    const s = script(reply(503), reply(200));
    const res = await httpRequest("http://x/a", {}, s.opts({ maxRetries: 2 }));
    assert.equal(res.status, 200);
    assert.equal(s.calls.length, 2);
  });

  it("never retries by default", async () => {
    const s = script(reply(429));
    const res = await httpRequest("http://x/a", {}, s.opts());
    assert.equal(res.status, 429);
    assert.equal(s.calls.length, 1);
  });

  it("does not retry 4xx other than 429", async () => {
    for (const status of [400, 403, 404, 422]) {
      const s = script(reply(status));
      const res = await httpRequest(
        "http://x/a",
        {},
        s.opts({ maxRetries: 3 }),
      );
      assert.equal(res.status, status);
      assert.equal(s.calls.length, 1);
      assert.deepEqual(s.waits, []);
    }
  });

  it("honors retryStatuses", async () => {
    const s = script(reply(503));
    const res = await httpRequest(
      "http://x/a",
      {},
      s.opts({ maxRetries: 2, retryStatuses: [429] }),
    );
    assert.equal(res.status, 503);
    assert.equal(s.calls.length, 1);
  });

  it("waits for Retry-After delta-seconds", async () => {
    const s = script(reply(429, { "retry-after": "2" }), reply(200));
    await httpRequest("http://x/a", {}, s.opts({ maxRetries: 1 }));
    assert.deepEqual(s.waits, [2000]);
  });

  it("waits for a Retry-After HTTP-date", async () => {
    const s = script(
      reply(429, { "retry-after": "Thu, 01 Jan 2026 00:00:03 GMT" }),
      reply(200),
    );
    await httpRequest("http://x/a", {}, s.opts({ maxRetries: 1 }));
    assert.deepEqual(s.waits, [3000]);
  });

  it("caps a long Retry-After at maxDelayMs", async () => {
    const s = script(reply(429, { "retry-after": "3600" }), reply(200));
    await httpRequest(
      "http://x/a",
      {},
      s.opts({ maxRetries: 1, maxDelayMs: 5000 }),
    );
    assert.deepEqual(s.waits, [5000]);
  });

  it("uses the fallback delay when Retry-After is unusable", async () => {
    const s = script(reply(429, { "retry-after": "later" }), reply(200));
    await httpRequest(
      "http://x/a",
      {},
      s.opts({ maxRetries: 1, fallbackDelayMs: 750 }),
    );
    assert.deepEqual(s.waits, [750]);
  });

  it("retries once after a 401 via onUnauthorized without charging retries", async () => {
    const s = script(reply(401), reply(401), reply(200));
    let refreshed = 0;
    const res = await httpRequest(
      "http://x/a",
      {},
      s.opts({
        onUnauthorized: () => {
          refreshed++;
        },
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(refreshed, 1);
    assert.equal(s.calls.length, 2);
    assert.deepEqual(s.waits, []);
  });

  it("builds the init per attempt when given a function", async () => {
    const s = script(reply(401), reply(429), reply(200));
    let token = "old";
    let n = 0;
    await httpRequest(
      "http://x/a",
      () => ({ headers: { Authorization: `${token}-${++n}` } }),
      s.opts({
        maxRetries: 1,
        retryStatuses: [429],
        onUnauthorized: () => {
          token = "new";
        },
      }),
    );
    const auth = s.calls.map(
      (c) => (c.init?.headers as Record<string, string>).Authorization,
    );
    assert.deepEqual(auth, ["old-1", "new-2", "new-3"]);
  });
});

describe("failure helpers", () => {
  it("slices the body to the requested length", async () => {
    assert.equal(await bodySnippet(new Response("abcdef"), 3), "abc");
  });
  it("returns an empty snippet when the body cannot be read", async () => {
    const res = new Response("x");
    await res.text();
    assert.equal(await bodySnippet(res, 10), "");
  });
  it("builds an Error from the snippet", async () => {
    const err = await httpFailure(
      new Response("nope", { status: 500 }),
      2,
      (d) => `failed: ${d}`,
    );
    assert.equal(err.message, "failed: no");
  });
});
