import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect } from "../src/fixtures.js";

/** API client authenticated with a raw session cookie. */
export function apiWithCookie(cookie: {
  name: string;
  value: string;
}): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
}

/** Starts the Spotify login and returns the fake authorize URL's state. */
export async function startSpotify(
  api: APIRequestContext,
  redirectTo?: string,
): Promise<{ location: URL; state: string }> {
  const res = await api.get("/integrations/spotify/start", {
    params: redirectTo ? { redirectTo } : {},
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = new URL(res.headers()["location"]!);
  return { location, state: location.searchParams.get("state")! };
}

/** Runs the full fake connect flow (start, then callback with a fake code). */
export async function connectSpotify(
  api: APIRequestContext,
  name = "tester",
): Promise<void> {
  const { state } = await startSpotify(api);
  const cb = await api.get("/integrations/spotify/callback", {
    params: { code: `fake-code:${name}`, state },
    maxRedirects: 0,
  });
  expect(cb.status()).toBe(302);
  expect(cb.headers()["location"]).toContain("spotify=connected");
}
