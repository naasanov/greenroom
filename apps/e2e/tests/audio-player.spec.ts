import type { BandSeedResult } from "@greenroom/db";
import { USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { seedGigMedia, type MediaSeed } from "./media-gallery-helpers.js";

// Route stubs cannot intercept requests from a page controlled by the service worker (WebKit).
test.use({ serviceWorkers: "block" });

const NAME = "riff.wav";
const RATE = 4000;
const SECONDS = 6;

/** 6 s mono 16-bit PCM sine (4 kHz keeps the base64 body under the JSON limit): loud for the first half, quiet for the second. */
function wav(): Buffer {
  const samples = RATE * SECONDS;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const amp = i < samples / 2 ? 0.8 : 0.1;
    const v = Math.sin((2 * Math.PI * 440 * i) / RATE) * amp * 32767;
    data.writeInt16LE(Math.round(v), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let seed: BandSeedResult;
let m: MediaSeed;
let fileId: string;

const viewerOf = (page: Page) => page.getByRole("dialog", { name: NAME });

async function openPlayer(page: Page) {
  await page.goto("/files");
  await page.getByRole("button", { name: `Open ${NAME}` }).click();
  const viewer = viewerOf(page);
  await expect(viewer.getByRole("slider", { name: "Seek" })).toBeVisible({
    timeout: 30_000,
  });
  return viewer;
}

/** Clicks the waveform at a fraction of its width, which seeks to that point. */
async function seekTo(viewer: ReturnType<typeof viewerOf>, fraction: number) {
  const wave = viewer.getByRole("slider", { name: "Seek" });
  const box = await wave.boundingBox();
  await wave.click({ position: { x: box!.width * fraction, y: 40 } });
}

async function addMarkerVia(title: string, positionMs: number) {
  const res = await m.ava.post(
    `/bands/${BAND}/files/items/${encodeURIComponent(fileId)}/markers`,
    { data: { title, positionMs } },
  );
  expect(res.status()).toBeLessThan(300);
}

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, {});
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  const file = await m.fake.external({
    action: "add",
    name: NAME,
    parentId: root.folder.id,
    mimeType: "audio/wav",
    contentBase64: wav().toString("base64"),
  });
  fileId = file.id;
});

test("opens the player, plays and pauses", async ({ page }) => {
  const viewer = await openPlayer(page);
  const toggle = viewer.getByRole("button", { name: /^(Play|Pause)$/ });
  const time = viewer.getByTestId("player-time");
  await expect(toggle).toHaveAccessibleName("Play");
  await expect(time).toHaveText("0:00 / 0:06");

  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Pause");
  // Headless WebKit may not advance the audio clock, so progress is only
  // asserted on desktop; play/pause state above does not depend on audio.
  if (test.info().project.name === "desktop") {
    await expect(time).not.toHaveText(/^0:00 \//);
  }

  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Play");
});

test("adds a marker at the playhead and it persists", async ({ page }) => {
  const viewer = await openPlayer(page);
  await seekTo(viewer, 0.5);
  await viewer.getByRole("button", { name: "Add marker" }).click();

  const row = viewer.getByTestId("marker-row").filter({ hasText: "Marker 1" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("added by Ava Admin");
  await expect(row).toContainText(/0:0[23]\.\d/);
  await expect(viewer.getByTestId("waveform-marker")).toHaveCount(1);

  await expect
    .poll(async () => {
      const res = await m.ava.get(
        `/bands/${BAND}/files/items/${encodeURIComponent(fileId)}/markers`,
      );
      return (await res.json()).length;
    })
    .toBe(1);
  await page.reload();
  const again = await openPlayer(page);
  await expect(
    again.getByTestId("marker-row").filter({ hasText: "Marker 1" }),
  ).toBeVisible();
});

test("the marker sheet renames, retimes, nudges and deletes", async ({
  page,
}) => {
  await addMarkerVia("Verse", 1000);
  const viewer = await openPlayer(page);
  await viewer.getByTestId("marker-row").filter({ hasText: "Verse" }).click();
  const sheet = viewer.getByRole("dialog", { name: "Edit marker" });
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Marker title").fill("Chorus");
  await sheet.getByLabel("Marker title").blur();
  const row = viewer.getByTestId("marker-row").filter({ hasText: "Chorus" });
  await expect(row).toBeVisible();

  await sheet.getByLabel("Marker time").fill("0:02.5");
  await sheet.getByLabel("Marker time").blur();
  await expect(row).toContainText("0:02.5");

  await sheet.getByRole("button", { name: "Nudge forward 1 second" }).click();
  await expect(row).toContainText("0:03.5");
  await expect(
    viewer.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();

  await sheet.getByRole("button", { name: "Delete marker" }).click();
  await sheet.getByRole("button", { name: "Confirm delete" }).click();
  await expect(sheet).toBeHidden();
  await expect(viewer.getByTestId("marker-row")).toHaveCount(0);
});

test("loop panel defaults to the playhead's stretch", async ({ page }) => {
  await addMarkerVia("Intro", 2000);
  await addMarkerVia("Outro", 4000);
  const viewer = await openPlayer(page);
  await expect(viewer.getByTestId("marker-row")).toHaveCount(2);
  await seekTo(viewer, 0.5);

  await viewer.getByTestId("loop-fab").click();
  const panel = viewer.getByTestId("loop-panel");
  await expect(panel.getByLabel("Loop start")).toHaveText("Intro");
  await expect(panel.getByLabel("Loop end")).toHaveText("Outro");

  await panel.getByLabel("Loop end").click();
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option", { name: "Outro" })).toBeVisible();
  await expect(list.getByRole("option", { name: "End" })).toBeVisible();
  await expect(list.getByRole("option", { name: "Beginning" })).toHaveCount(0);
  await expect(list.getByRole("option", { name: "Intro" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Stop looping" }).click();
  await expect(panel).toBeHidden();
  await expect(viewer.getByTestId("loop-fab")).toBeVisible();
});

test("speed and transpose are remembered per recording", async ({ page }) => {
  const viewer = await openPlayer(page);
  await viewer.getByRole("button", { name: "Faster" }).click();
  await viewer.getByRole("button", { name: "Transpose up" }).click();
  await expect(viewer.getByTestId("speed-readout")).toHaveText("1.1x");
  await expect(viewer.getByTestId("transpose-readout")).toHaveText("+1 st");

  await page.reload();
  const again = await openPlayer(page);
  await expect(again.getByTestId("speed-readout")).toHaveText("1.1x");
  await expect(again.getByTestId("transpose-readout")).toHaveText("+1 st");
});

test("Escape closes the marker sheet first, then the viewer", async ({
  page,
}) => {
  await addMarkerVia("Verse", 1000);
  const viewer = await openPlayer(page);
  await viewer.getByTestId("marker-row").filter({ hasText: "Verse" }).click();
  const sheet = viewer.getByRole("dialog", { name: "Edit marker" });
  await expect(sheet).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(viewer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});
