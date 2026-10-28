import { SONGS, USERS } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";
import { cards, openLibrary, sheet } from "./library-helpers.js";

/** Creates the gig's Drive folder, drops files into it and returns the polled items. */
async function addFiles(
  ava: APIRequestContext,
  fake: FakeDrive,
  gig: { id: string; title: string },
  files: { name: string; mime: string }[],
): Promise<{ id: string; name: string }[]> {
  await ava.post(`/bands/${BAND}/gigs/${gig.id}/media/folders`, {
    data: { name: "tmp" },
  });
  const media = await (
    await ava.get(`/bands/${BAND}/gigs/${gig.id}/media`)
  ).json();
  await ava.delete(`/bands/${BAND}/media/folders/${media.folders[0].id}`);
  const folder = (await fake.files()).find(
    (f) => /^\d{4}-\d\d-\d\d /.test(f.name) && f.name.endsWith(gig.title),
  )!;
  for (const f of files) {
    await fake.external({
      action: "add",
      name: f.name,
      parentId: folder.id,
      mimeType: f.mime,
      content: f.name,
    });
  }
  await fake.poll();
  const after = await (
    await ava.get(`/bands/${BAND}/gigs/${gig.id}/media`)
  ).json();
  return after.unsorted;
}

test("song sheet lists linked videos by gig (newest first), then photos, and opens the viewer", async ({
  page,
  testApi,
  loginAs,
}) => {
  const seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const club = seed.gigs.upcomingClub;
  const bar = seed.gigs.pastBar;
  const clubItems = await addFiles(ava, fake, club, [
    { name: "a.mp4", mime: "video/mp4" },
    { name: "p.png", mime: "image/png" },
  ]);
  const barItems = await addFiles(ava, fake, bar, [
    { name: "b.mp4", mime: "video/mp4" },
  ]);
  for (const items of [clubItems, barItems]) {
    const res = await ava.put(`/bands/${BAND}/media/items/song`, {
      data: { itemIds: items.map((i) => i.id), songId: SONGS.skyline.id },
    });
    expect(res.status()).toBe(200);
  }

  await openLibrary(page);
  await cards(page).filter({ hasText: SONGS.skyline.title }).click();
  const videos = sheet(page).getByTestId("song-videos");
  await expect(videos).toBeVisible();
  const groups = videos.getByTestId("song-video-group");
  // Videos by gig (newest gig first), then the photo group.
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAttribute("data-gig", club.title);
  await expect(groups.nth(1)).toHaveAttribute("data-gig", bar.title);
  await expect(groups.nth(2)).toHaveAttribute("data-gig", club.title);
  await expect(groups.nth(0).getByTestId("song-video")).toHaveCount(1);
  await expect(groups.nth(2).getByTestId("song-video")).toHaveCount(1);
  await expect(groups.nth(1)).toContainText("Rusty Anchor");

  await groups.nth(1).getByTestId("song-video").click();
  await expect(page.getByTestId("media-viewer")).toBeVisible();
  await expect(page.getByTestId("viewer-name")).toContainText("Skyline Drive");
  await expect(page.getByTestId("viewer-song")).toHaveText(SONGS.skyline.title);
  await page.getByRole("button", { name: "Close viewer" }).click();
  await expect(page.getByTestId("media-viewer")).toBeHidden();
  await page.screenshot({
    path: "/tmp/claude-1001/-home-dev-projects/7257d174-f735-587c-871d-3359d4518891/scratchpad/wave5/song-videos-desktop.png",
  });
});

test("the Videos section is hidden for a song with no linked media", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await cards(page).filter({ hasText: SONGS.skyline.title }).click();
  await expect(sheet(page).getByTestId("used-in")).toBeVisible();
  await expect(sheet(page).getByTestId("song-videos")).toHaveCount(0);
});
