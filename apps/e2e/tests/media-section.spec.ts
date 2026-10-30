import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("media section shows the empty state, thumbnails with counts, and missing items", async ({
  page,
  testApi,
}) => {
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const gig = seed.gigs.upcomingClub;
  const drawer = page.getByRole("dialog", { name: gig.title });

  await page.goto(`/gigs/${gig.id}`);
  await expect(drawer.getByTestId("media-empty")).toHaveText("No media yet");

  // Touching media creates the gig's Drive folder, then files appear via the poller.
  await ava.post(`/bands/${BAND}/gigs/${gig.id}/media/folders`, {
    data: { name: "Stage" },
  });
  const gigFolder = (await fake.files()).find((f) =>
    /^\d\d-\d\d-\d\d /.test(f.name),
  )!;
  for (const [name, mimeType] of [
    ["a.png", "image/png"],
    ["b.png", "image/png"],
    ["c.mp4", "video/mp4"],
  ]) {
    await fake.external({
      action: "add",
      name,
      parentId: gigFolder.id,
      mimeType,
      content: name,
    });
  }
  await fake.poll();
  await page.reload();
  await expect(drawer.getByTestId("media-counts")).toHaveText(
    "2 photos, 1 video",
  );
  await expect(drawer.getByTestId("media-strip")).toBeVisible();

  const doomed = (await fake.files()).find((f) => f.name === "a.png")!;
  await fake.external({ action: "delete", fileId: doomed.id });
  await fake.poll();
  await page.reload();
  await expect(drawer.getByTestId("media-missing")).toContainText(
    "No longer in Drive",
  );
});
