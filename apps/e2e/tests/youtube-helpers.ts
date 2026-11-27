import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "../src/fixtures.js";

export const YOUTUBE_CALLBACK = "/integrations/youtube/callback";

/** Starts the YouTube connect flow and returns the fake authorize URL's state. */
export async function startYoutube(
  api: APIRequestContext,
  redirectTo?: string,
): Promise<{ location: URL; state: string }> {
  const res = await api.get("/integrations/youtube/start", {
    params: redirectTo ? { redirectTo } : {},
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = new URL(res.headers()["location"]!);
  return { location, state: location.searchParams.get("state")! };
}

/** Runs the full fake connect flow (start, then callback with a fake code). */
export async function connectYoutube(
  api: APIRequestContext,
  email = "tester@example.com",
): Promise<void> {
  const { state } = await startYoutube(api, "/library");
  const cb = await api.get(YOUTUBE_CALLBACK, {
    params: { code: `fake-code:${email}`, state },
    maxRedirects: 0,
  });
  expect(cb.status()).toBe(302);
  expect(cb.headers()["location"]).toContain("youtube=connected");
}

/**
 * Stands in for Google's consent page. The API's start redirect is fetched
 * here and answered with the real callback URL (fake code or denial).
 */
export async function fakeYoutubeConsent(
  page: Page,
  outcome: "approve" | "deny" = "approve",
): Promise<void> {
  await page
    .context()
    .route("**/integrations/youtube/start*", async (route) => {
      const res = await route.fetch({ maxRedirects: 0 });
      const authorize = new URL(res.headers()["location"]!);
      const cb = new URL(authorize.searchParams.get("redirect_uri")!);
      cb.searchParams.set("state", authorize.searchParams.get("state")!);
      if (outcome === "approve")
        cb.searchParams.set("code", "fake-code:tester@example.com");
      else cb.searchParams.set("error", "access_denied");
      // WebKit rejects fulfilled redirects, so a tiny page performs the hop.
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(cb.toString())})</script>`,
      });
    });
}
