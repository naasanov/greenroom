import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

type TestApi = Parameters<typeof clientFor>[0];

export interface MediaSeed {
  gigId: string;
  gigTitle: string;
  fake: FakeDrive;
  ava: Awaited<ReturnType<typeof clientFor>>;
  /** Drive id of the gig folder. */
  gigFolderId: string;
}

/**
 * Links Drive, creates the gig folder plus the named subfolders, and drops
 * files into Unsorted (`unsorted`) or a folder (`folders[name]`), then polls.
 */
export async function seedGigMedia(
  testApi: TestApi,
  seed: BandSeedResult,
  opts: { unsorted?: string[]; folders?: Record<string, string[]> },
): Promise<MediaSeed> {
  const gig = seed.gigs.upcomingClub;
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const made: Record<string, string> = {};
  for (const name of Object.keys(opts.folders ?? {})) {
    const res = await ava.post(`/bands/${BAND}/gigs/${gig.id}/media/folders`, {
      data: { name },
    });
    expect(res.status()).toBe(201);
    made[name] = (await res.json()).id;
  }
  if (!Object.keys(made).length) {
    // Touching media creates the gig folder lazily.
    await ava.post(`/bands/${BAND}/gigs/${gig.id}/media/folders`, {
      data: { name: "tmp" },
    });
    const tmp = (
      await (await ava.get(`/bands/${BAND}/gigs/${gig.id}/media`)).json()
    ).folders[0];
    await ava.delete(`/bands/${BAND}/media/folders/${tmp.id}`);
  }
  const files = await fake.files();
  const gigFolder = files.find((f) => /^\d{4}-\d\d-\d\d /.test(f.name))!;
  const mime = (n: string) => (n.endsWith(".mp4") ? "video/mp4" : "image/png");
  for (const n of opts.unsorted ?? []) {
    await fake.external({
      action: "add",
      name: n,
      parentId: gigFolder.id,
      mimeType: mime(n),
      content: n,
    });
  }
  for (const [folder, names] of Object.entries(opts.folders ?? {})) {
    const driveFolder = (await fake.files()).find(
      (f) => f.name === folder && f.parentId === gigFolder.id,
    )!;
    for (const n of names) {
      await fake.external({
        action: "add",
        name: n,
        parentId: driveFolder.id,
        mimeType: mime(n),
        content: n,
      });
    }
  }
  await fake.poll();
  return {
    gigId: gig.id,
    gigTitle: gig.title,
    fake,
    ava,
    gigFolderId: gigFolder.id,
  };
}

export const tile = (page: Page, name: string) =>
  page.locator(`[data-testid="media-tile"][data-name="${name}"]`);
export const section = (page: Page, name: string) =>
  page.locator(`[data-testid="media-section"][data-section="${name}"]`);
export const bar = (page: Page) => page.getByTestId("selection-bar");
export const barButton = (page: Page, name: string) =>
  bar(page).getByRole("button", { name, exact: true });

export async function openGallery(page: Page, gigId: string) {
  await page.goto(`/gigs/${gigId}/media`);
  await expect(page.getByTestId("media-gallery")).toBeVisible();
}
