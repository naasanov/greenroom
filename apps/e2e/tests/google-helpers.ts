import type { Page } from "@playwright/test";

/**
 * Stands in for Google's consent page. The API's start redirect is fetched
 * here and answered with the real callback URL (fake code or denial).
 */
export async function fakeGoogleConsent(
  page: Page,
  outcome: "approve" | "deny" = "approve",
  email = "band@example.com",
): Promise<void> {
  await page
    .context()
    .route("**/integrations/google/*/start*", async (route) => {
      const res = await route.fetch({ maxRedirects: 0 });
      const authorize = new URL(res.headers()["location"]!);
      const cb = new URL(authorize.searchParams.get("redirect_uri")!);
      cb.searchParams.set("state", authorize.searchParams.get("state")!);
      if (outcome === "approve")
        cb.searchParams.set("code", `fake-code:${email}`);
      else cb.searchParams.set("error", "access_denied");
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(cb.toString())})</script>`,
      });
    });
}
