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

/** Mono 16-bit PCM sine (low rates keep the base64 body under the JSON limit): loud for the first half, quiet for the second. */
function wav(seconds = SECONDS, rate = RATE): Buffer {
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const amp = i < samples / 2 ? 0.8 : 0.1;
    const v = Math.sin((2 * Math.PI * 440 * i) / rate) * amp * 32767;
    data.writeInt16LE(Math.round(v), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let seed: BandSeedResult;
let m: MediaSeed;
let fileId: string;

const viewerOf = (page: Page, name = NAME) =>
  page.getByRole("dialog", { name });

async function openPlayer(page: Page, name = NAME) {
  await page.goto("/files");
  await page.getByRole("button", { name: `Open ${name}` }).click();
  const viewer = viewerOf(page, name);
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

// Taps whatever connects to the destination with an AnalyserNode and exposes its RMS.
async function installOutputProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __rms: () => number };
    const analysers: AnalyserNode[] = [];
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      ...args: unknown[]
    ) => unknown;
    (AudioNode.prototype as { connect: unknown }).connect = function (
      this: AudioNode,
      dest: unknown,
      ...rest: unknown[]
    ) {
      if (dest instanceof AudioDestinationNode) {
        const ctx = this.context as AudioContext;
        const tap = ctx.createAnalyser();
        const mute = ctx.createGain();
        mute.gain.value = 0;
        connect.call(this, tap);
        connect.call(tap, mute);
        connect.call(mute, dest);
        analysers.push(tap);
      }
      return connect.call(this, dest, ...rest);
    };
    w.__rms = () => {
      let peak = 0;
      for (const tap of analysers) {
        const buf = new Float32Array(tap.fftSize);
        tap.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
        peak = Math.max(peak, rms);
      }
      return peak;
    };
  });
}

test("playing emits audible output and pausing silences it", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "desktop",
    "WebKit headless audio output is not asserted",
  );
  await installOutputProbe(page);
  const viewer = await openPlayer(page);
  const rms = () =>
    page.evaluate(() => (window as unknown as { __rms: () => number }).__rms());
  const toggle = viewer.getByRole("button", { name: /^(Play|Pause)$/ });

  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Pause");
  await expect.poll(rms, { timeout: 5_000 }).toBeGreaterThan(0.01);

  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Play");
  await expect.poll(rms, { timeout: 5_000 }).toBeLessThan(0.001);
});

// An 11 s file spans three 5 s chunks if the engine splits it; a seam at 5 s kills the worklet.
test("audio keeps playing across the 5 s mark without worklet errors", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "desktop",
    "WebKit headless audio output is not asserted",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const LONG = "long.wav";
  const root = await (await m.ava.get(`/bands/${BAND}/files/folder`)).json();
  await m.fake.external({
    action: "add",
    name: LONG,
    parentId: root.folder.id,
    mimeType: "audio/wav",
    contentBase64: wav(11, 3000).toString("base64"),
  });
  await installOutputProbe(page);
  const viewer = await openPlayer(page, LONG);
  const rms = () =>
    page.evaluate(() => (window as unknown as { __rms: () => number }).__rms());
  const toggle = viewer.getByRole("button", { name: /^(Play|Pause)$/ });
  const time = viewer.getByTestId("player-time");

  await seekTo(viewer, 4.5 / 11);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Pause");
  await expect(time).toHaveText(/^0:05 \//, { timeout: 10_000 });
  await page.waitForTimeout(400);

  // Still audible just past the 5 s seam; silence measures below 0.001.
  for (let i = 0; i < 3; i++) {
    expect(await rms()).toBeGreaterThan(0.01);
    await page.waitForTimeout(100);
  }
  expect(errors.filter((e) => /RangeError|processorerror/i.test(e))).toEqual(
    [],
  );
});

test("adds a marker at the playhead and it persists", async ({ page }) => {
  const viewer = await openPlayer(page);
  await seekTo(viewer, 0.5);
  await viewer.getByRole("button", { name: "Add marker" }).click();

  const sheet = viewer.getByRole("dialog", { name: "Edit marker" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Marker title")).toBeFocused();
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

test("Space toggles playback even when a button has focus", async ({
  page,
}) => {
  const viewer = await openPlayer(page);
  const toggle = viewer.getByRole("button", { name: /^(Play|Pause)$/ });
  const add = viewer.getByRole("button", { name: "Add marker" });
  await add.click();
  await expect(viewer.getByTestId("marker-row")).toHaveCount(1);
  await add.focus();

  await page.keyboard.press("Space");
  await expect(toggle).toHaveAccessibleName("Pause");
  // Space must not re-click the focused Add marker button.
  await expect(viewer.getByTestId("marker-row")).toHaveCount(1);

  await page.keyboard.press("Space");
  await expect(toggle).toHaveAccessibleName("Play");
  await expect(viewer.getByTestId("marker-row")).toHaveCount(1);
});

test("Space types normally in the marker title field", async ({ page }) => {
  const viewer = await openPlayer(page);
  await viewer.getByRole("button", { name: "Add marker" }).click();
  const title = viewer.getByLabel("Marker title");
  await expect(title).toBeFocused();
  await page.keyboard.type("Big end");
  await expect(title).toHaveValue("Big end");
  await expect(
    viewer.getByRole("button", { name: "Play", exact: true }),
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
  // The row moves before the 400 ms PATCH debounce fires.
  await expect(row).toContainText("0:03.5", { timeout: 200 });
  await expect(
    viewer.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await sheet.getByRole("button", { name: "Delete marker" }).click();
  await sheet.getByRole("button", { name: "Confirm delete" }).click();
  await expect(sheet).toBeHidden();
  await expect(viewer.getByTestId("marker-row")).toHaveCount(0);
});

test("nudging a marker while playing keeps playing", async ({ page }) => {
  await addMarkerVia("Verse", 1000);
  const viewer = await openPlayer(page);
  await viewer.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();

  await viewer.getByTestId("marker-row").filter({ hasText: "Verse" }).click();
  const sheet = viewer.getByRole("dialog", { name: "Edit marker" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Nudge forward 1 second" }).click();

  const row = viewer.getByTestId("marker-row").filter({ hasText: "Verse" });
  await expect(row).toContainText("0:02.0");
  await expect(
    viewer.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
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
  const speedBtn = viewer.getByTestId("speed-button");
  const pitchBtn = viewer.getByTestId("pitch-button");
  const speedPanel = viewer.getByTestId("speed-panel");
  const pitchPanel = viewer.getByTestId("pitch-panel");
  await expect(speedBtn).toHaveAccessibleName("Speed 1x");
  await expect(pitchBtn).toHaveAccessibleName("Pitch 0");

  await speedBtn.click();
  await expect(speedPanel).toBeVisible();
  await viewer.getByRole("button", { name: "Faster" }).click();
  await expect(viewer.getByTestId("speed-readout")).toHaveText("1.1x");

  // Only one panel is open at a time.
  await pitchBtn.click();
  await expect(pitchPanel).toBeVisible();
  await expect(speedPanel).toBeHidden();
  await viewer.getByRole("button", { name: "Transpose up" }).click();
  await expect(viewer.getByTestId("transpose-readout")).toHaveText("+1 st");

  // Escape closes the panel but not the viewer.
  await page.keyboard.press("Escape");
  await expect(pitchPanel).toBeHidden();
  await expect(viewer).toBeVisible();
  await expect(speedBtn).toHaveAccessibleName("Speed 1.1x");
  await expect(pitchBtn).toHaveAccessibleName("Pitch +1");

  await page.reload();
  const again = await openPlayer(page);
  await expect(again.getByTestId("speed-button")).toHaveAccessibleName(
    "Speed 1.1x",
  );
  await expect(again.getByTestId("pitch-button")).toHaveAccessibleName(
    "Pitch +1",
  );
  await again.getByTestId("speed-button").click();
  await expect(again.getByTestId("speed-readout")).toHaveText("1.1x");
  await again.getByRole("button", { name: "Reset speed" }).click();
  await expect(again.getByTestId("speed-readout")).toHaveText("1x");
  await again.getByTestId("pitch-button").click();
  await expect(again.getByTestId("transpose-readout")).toHaveText("+1 st");
  await again.getByRole("button", { name: "Reset transpose" }).click();
  await expect(again.getByTestId("transpose-readout")).toHaveText("0 st");
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
