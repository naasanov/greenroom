import { request as pwRequest } from "@playwright/test";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

test("large JSON responses are gzip-compressed when requested", async ({
  testApi,
}) => {
  const { cookie } = await testApi.login("gz@example.com");
  const api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: {
      Cookie: `${cookie.name}=${cookie.value}`,
      "Accept-Encoding": "gzip",
    },
  });
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const base = `/bands/${band.id}/songs`;
  for (let i = 0; i < 40; i++) {
    const res = await api.post(base, {
      data: { title: `Compressible song number ${i}`, artist: "Repeat Band" },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
  const res = await api.get(base);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-encoding"]).toBe("gzip");
  expect(await res.json()).toHaveLength(40);
});

test("CORS preflight is cacheable", async () => {
  const api = await pwRequest.newContext({ baseURL: API_URL });
  const res = await api.fetch("/bands", {
    method: "OPTIONS",
    headers: {
      Origin: WEB_URL,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  expect(res.status()).toBe(204);
  expect(res.headers()["access-control-max-age"]).toBe("86400");
});
