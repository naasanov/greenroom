import { request as pwRequest } from "@playwright/test";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { createGig, newBand } from "./calendar-helpers.js";

test.skip(({ isMobile }) => isMobile, "HTML-level spec, desktop only");

const ID = "0b9a1c52-3c1e-4f0e-9a55-6f7d3a1b2c3d";

test("deep links serve a meaningful title and og:title without a session", async ({
  testApi,
}) => {
  const { ava, bandId } = await newBand(testApi);
  const songRes = await ava.api.post(`/bands/${bandId}/songs`, {
    data: { title: "Blackbird", artist: "Secret Artist", notes: "hidden" },
  });
  expect(songRes.status(), await songRes.text()).toBe(201);
  const song = await songRes.json();
  const gig = await createGig(ava.api, bandId, {
    title: "Club Meridian",
    venueName: "Hidden Venue",
  });

  const anon = await pwRequest.newContext();
  try {
    const html = async (path: string) =>
      (await anon.get(`${WEB_URL}${path}`)).text();
    const expectTitle = (body: string, title: string) => {
      expect(body).toContain(`<title>${title}</title>`);
      expect(body).toMatch(
        new RegExp(`property="og:title" content="${title}"`),
      );
    };

    const songHtml = await html(`/songs/${song.id}`);
    expectTitle(songHtml, "Blackbird | Greenroom");
    expect(songHtml).not.toContain("Secret Artist");

    const gigHtml = await html(`/gigs/club-meridian-${gig.id}`);
    expectTitle(gigHtml, "Club Meridian | Greenroom");
    expect(gigHtml).not.toContain("Hidden Venue");

    expectTitle(await html(`/practices/${ID}`), "Practice | Greenroom");
    expectTitle(await html(`/songs/${ID}`), "Greenroom");

    const api = await anon.get(
      `${API_URL}/public/link-preview/songs/${song.id}`,
    );
    expect(await api.json()).toEqual({ title: "Blackbird" });
    expect(
      (
        await anon.get(`${API_URL}/public/link-preview/songs/not-a-uuid`)
      ).status(),
    ).toBe(404);
    expect(
      (await anon.get(`${API_URL}/public/link-preview/gigs/${ID}`)).status(),
    ).toBe(404);
  } finally {
    await anon.dispose();
  }
});
