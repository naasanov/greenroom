import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

test("requires a signed-in user", async () => {
  const anon = await pwRequest.newContext({ baseURL: API_URL });
  const res = await anon.post("/feedback", { data: { message: "hi" } });
  expect(res.status()).toBe(401);
});

test("validates the body", async ({ testApi }) => {
  const { api } = await client(testApi, "a@example.com");
  for (const data of [
    {},
    { message: "   " },
    { message: "x".repeat(4001) },
    { message: "ok", title: "t".repeat(121) },
    { message: "ok", bandId: "nope" },
  ]) {
    const res = await api.post("/feedback", { data });
    expect(res.status(), JSON.stringify(data).slice(0, 40)).toBe(400);
  }
  expect(await testApi.githubIssues()).toHaveLength(0);
});

test("records a labelled issue with reporter and band, no secrets", async ({
  testApi,
}) => {
  const { user, api } = await client(testApi, "a@example.com");
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const res = await api.post("/feedback", {
    data: {
      message: "The button is hidden\non small screens",
      pageUrl: "http://localhost:3000/events",
      userAgent: "TestAgent/1.0",
      bandId: band.id,
    },
  });
  expect(res.status()).toBe(201);
  expect(await res.json()).toEqual({ ok: true });

  const [issue, ...rest] = await testApi.githubIssues();
  expect(rest).toHaveLength(0);
  expect(issue!.labels).toEqual(["feedback"]);
  expect(issue!.title).toBe("Feedback: The button is hidden on small screens");
  expect(issue!.body).toContain("The button is hidden\non small screens");
  expect(issue!.body).toContain(`${user.displayName} (a@example.com)`);
  expect(issue!.body).toContain("Band: The Foxes");
  expect(issue!.body).toContain("Page: http://localhost:3000/events");
  expect(issue!.body).toContain("User agent: TestAgent/1.0");
  expect(issue!.body).not.toMatch(/gr_session|token/i);
});

test("writes category and area as body lines, tolerating bad or missing values", async ({
  testApi,
}) => {
  const { api } = await client(testApi, "ca@example.com");
  const ok = await api.post("/feedback", {
    data: { message: "m", category: "feature", area: "Roster" },
  });
  expect(ok.status()).toBe(201);
  const odd = await api.post("/feedback", {
    data: { message: "n", category: "nonsense" },
  });
  expect(odd.status()).toBe(201);
  const [first, second] = await testApi.githubIssues();
  expect(first!.body).toContain("Category: Feature Request");
  expect(first!.body).toContain("Area: Roster");
  expect(first!.labels).toEqual(["feedback"]);

  const forged = await api.post("/feedback", {
    data: { message: "o", area: "Roster\nReporter: evil@example.com" },
  });
  expect(forged.status()).toBe(201);
  const issues = await testApi.githubIssues();
  const body = issues[issues.length - 1]!.body;
  expect(body).toContain("Area: Roster Reporter: evil@example.com");
  expect(body.match(/^Reporter:/gm)).toHaveLength(1);
  expect(second!.body).not.toContain("Category:");
  expect(second!.body).not.toContain("Area:");
});

test("a given title is used and a foreign band id is not disclosed", async ({
  testApi,
}) => {
  const owner = await client(testApi, "owner@example.com");
  const band = await (
    await owner.api.post("/bands", { data: { name: "Secret Band" } })
  ).json();
  const other = await client(testApi, "other@example.com");
  const res = await other.api.post("/feedback", {
    data: { title: "Custom title", message: "hello", bandId: band.id },
  });
  expect(res.status()).toBe(201);
  const [issue] = await testApi.githubIssues();
  expect(issue!.title).toBe("Custom title");
  expect(issue!.body).toContain("Band: none");
  expect(issue!.body).not.toContain("Secret Band");
});

test("rate limits per user", async ({ testApi }) => {
  const a = await client(testApi, "a@example.com");
  const b = await client(testApi, "b@example.com");
  for (let i = 0; i < 5; i++) {
    const res = await a.api.post("/feedback", { data: { message: `m${i}` } });
    expect(res.status()).toBe(201);
  }
  const limited = await a.api.post("/feedback", { data: { message: "more" } });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).code).toBe("FEEDBACK_RATE_LIMITED");
  expect(
    (await b.api.post("/feedback", { data: { message: "mine" } })).status(),
  ).toBe(201);
  expect(await testApi.githubIssues()).toHaveLength(6);
});
