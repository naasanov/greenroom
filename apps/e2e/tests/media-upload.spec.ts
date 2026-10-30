import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import { request as pwRequest, type Page } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import { bytes } from "./api-uploads-helpers.js";
import {
  barButton,
  openGallery,
  section,
  seedGigMedia,
  tile,
  type MediaSeed,
} from "./media-gallery-helpers.js";

const SHOTS =
  "/tmp/claude-1001/-home-dev-projects/7257d174-f735-587c-871d-3359d4518891/scratchpad/wave5";
const MIB = 1024 * 1024;
const CHUNK = 8 * MIB;

let seed: BandSeedResult;
let m: MediaSeed;
let dir: string;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(USERS.ava.email);
  m = await seedGigMedia(testApi, seed, {
    unsorted: ["seed.png"],
    folders: { Stage: [] },
  });
  dir = mkdtempSync(join(tmpdir(), "gr-upload-"));
});

/** Writes a real file (stable mtime, so re-picking it keeps the fingerprint). */
function makeFile(name: string, size: number, seedNo = 1): string {
  const path = join(dir, name);
  writeFileSync(path, bytes(size, seedNo));
  return path;
}

const tray = (page: Page) => page.getByTestId("upload-tray");
const utile = (page: Page, name: string) =>
  page.locator(`[data-testid="upload-tile"][data-name="${name}"]`);
const pick = (page: Page, files: string | string[]) =>
  page.getByTestId("media-file-input").setInputFiles(files);

/** Holds chunk PUTs (optionally only those starting after byte 0) until released. */
async function holdChunks(page: Page, opts: { afterFirst?: boolean } = {}) {
  let release!: () => void;
  const open = new Promise<void>((r) => (release = r));
  await page.route("**/bands/*/uploads/*", async (route) => {
    const req = route.request();
    const range = req.headers()["content-range"] ?? "";
    const held =
      req.method() === "PUT" &&
      (!opts.afterFirst || !range.includes("bytes 0-"));
    if (held) await open;
    await route.continue().catch(() => {});
  });
  return release;
}

/** Fails every chunk after the first at the network level, so the server keeps the first chunk only. */
async function dropLaterChunks(page: Page) {
  await page.route("**/bands/*/uploads/*", async (route) => {
    const req = route.request();
    const range = req.headers()["content-range"] ?? "";
    if (req.method() === "PUT" && !range.includes("bytes 0-")) {
      await route.abort("failed").catch(() => {});
    } else {
      await route.continue().catch(() => {});
    }
  });
}

async function mySessions() {
  return (
    await m.ava.get(`/bands/${BAND}/gigs/${m.gigId}/uploads?mine=1`)
  ).json() as Promise<
    {
      id: string;
      status: string;
      bytesReceived: number;
      folderId: string | null;
    }[]
  >;
}

const mediaState = async () =>
  (await (await m.ava.get(`/bands/${BAND}/gigs/${m.gigId}/media`)).json()) as {
    unsorted: { name: string; songId: string | null; sizeBytes: number }[];
    folders: { name: string; items: { name: string; sizeBytes: number }[] }[];
  };

test("finished files stay in the tray until moved, here to Unsorted", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await pick(page, makeFile("big.mp4", CHUNK + MIB));
  await expect(tray(page)).toBeVisible();
  await expect(utile(page, "big.mp4")).toHaveAttribute("data-status", "done");
  await expect(
    utile(page, "big.mp4").getByTestId("upload-progress"),
  ).toHaveAttribute("data-progress", "100");
  // Done files wait in the tray; the gallery does not list them twice.
  await expect(
    section(page, "Unsorted").locator('[data-name="big.mp4"]'),
  ).toHaveCount(0);
  await expect(tray(page)).toBeVisible();
  await utile(page, "big.mp4").getByTestId("upload-open").click();
  await barButton(page, "Move to folder").click();
  await page.getByRole("button", { name: "Move to Unsorted" }).click();
  await expect(tray(page)).toBeHidden();
  await expect(
    section(page, "Unsorted").locator('[data-name="big.mp4"]'),
  ).toBeVisible();
  const state = await mediaState();
  expect(state.unsorted.find((i) => i.name === "big.mp4")?.sizeBytes).toBe(
    CHUNK + MIB,
  );
});

test("Select all then Move to folder works while items are still uploading", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await expect(page.getByTestId("upload-folder")).toHaveCount(0);
  await expect(page.getByTestId("upload-song-pick")).toHaveCount(0);
  const release = await holdChunks(page);
  await pick(page, [makeFile("a.png", 4000), makeFile("b.png", 4000, 2)]);
  await expect(utile(page, "a.png")).toHaveAttribute(
    "data-status",
    "uploading",
  );
  await page.getByTestId("upload-select-all").click();
  await expect(page.getByTestId("selection-count")).toHaveText("2");
  await barButton(page, "Move to folder").click();
  await page.getByRole("button", { name: "Move to Stage" }).click();
  await expect
    .poll(async () => (await mySessions()).filter((s) => s.folderId).length)
    .toBe(2);
  release();
  const stageSection = section(page, "Stage");
  await expect(stageSection.locator('[data-name="a.png"]')).toBeVisible();
  await expect(stageSection.locator('[data-name="b.png"]')).toBeVisible();
  // Placed uploads leave the tray on their own.
  await expect(tray(page)).toBeHidden();
});

test("rename and link-to-song while uploading apply on completion", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const release = await holdChunks(page);
  await pick(page, makeFile("x.mp4", 5000));
  await expect(utile(page, "x.mp4")).toHaveAttribute(
    "data-status",
    "uploading",
  );

  await utile(page, "x.mp4").getByTestId("upload-name").click();
  await page.getByTestId("upload-name-input").fill("renamed.mp4");
  await page.getByTestId("upload-name-input").press("Enter");
  await expect(utile(page, "renamed.mp4")).toBeVisible();

  await utile(page, "renamed.mp4").getByTestId("upload-open").click();
  await expect(page.getByTestId("selection-count")).toHaveText("1");
  await barButton(page, "Link to song").click();
  await page
    .getByTestId("song-pick-row")
    .filter({ hasText: SONGS.lowTide.title })
    .first()
    .click();
  await expect(
    utile(page, "renamed.mp4").getByTestId("upload-song"),
  ).toBeVisible();

  release();
  await expect(utile(page, "renamed.mp4")).toHaveAttribute(
    "data-status",
    "done",
  );
  await utile(page, "renamed.mp4").getByTestId("upload-open").click();
  await barButton(page, "Move to folder").click();
  await page.getByRole("button", { name: "Move to Unsorted" }).click();
  const landed = tile(page, "renamed.mp4");
  await expect(landed).toBeVisible();
  await expect(landed.getByTestId("media-song")).toHaveText(
    SONGS.lowTide.title,
  );
  await expect
    .poll(async () => (await mediaState()).unsorted.map((i) => i.name))
    .toContain("renamed.mp4");
});

test("selection adapts, cancel one, then cancel all with a confirm", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await holdChunks(page);
  await pick(page, [
    makeFile("a.png", 4000),
    makeFile("b.png", 4000, 2),
    makeFile("c.png", 4000, 3),
  ]);
  await expect(utile(page, "a.png")).toBeVisible();

  await utile(page, "a.png").getByTestId("upload-open").click();
  await expect(barButton(page, "Rename")).toBeVisible();
  await expect(barButton(page, "Link to song")).toBeVisible();
  await utile(page, "b.png").getByTestId("upload-open").click();
  await expect(page.getByTestId("selection-count")).toHaveText("2");
  await expect(barButton(page, "Rename")).toHaveCount(0);
  await expect(barButton(page, "Move to folder")).toBeVisible();
  // Tapping a selected thumbnail only deselects it.
  await utile(page, "b.png").getByTestId("upload-open").click();
  await expect(utile(page, "b.png")).toBeVisible();
  await expect(page.getByTestId("selection-count")).toHaveText("1");

  await barButton(page, "Cancel upload").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel uploads" })
    .click();
  await expect(utile(page, "a.png")).toHaveCount(0);
  await expect(utile(page, "b.png")).toBeVisible();

  await page.getByTestId("upload-cancel-all").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel uploads" })
    .click();
  await expect(tray(page)).toBeHidden();
  await expect.poll(async () => (await mySessions()).length).toBe(0);
});

test("cancel all asks first and can be dismissed", async ({ page }) => {
  await openGallery(page, m.gigId);
  await holdChunks(page);
  await pick(page, makeFile("a.png", 4000));
  await page.getByTestId("upload-cancel-all").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(utile(page, "a.png")).toBeVisible();
});

test("an interrupted chunk is retried from the server offset", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const release = await holdChunks(page);
  await pick(page, makeFile("flaky.mp4", CHUNK + MIB));
  await expect.poll(async () => (await mySessions()).length).toBe(1);
  const [s] = await mySessions();
  const api = await pwRequest.newContext({ baseURL: API_URL });
  const res = await api.post(`/__test__/media/uploads/${s!.id}/interrupt`, {
    data: { acceptBytes: 256 * 1024 },
  });
  expect(res.status()).toBe(200);
  release();
  await expect(utile(page, "flaky.mp4")).toHaveAttribute("data-status", "done");
});

test("after a reload unfinished items say Re-add to finish; re-picking resumes", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  await dropLaterChunks(page);
  const big = makeFile("big.mp4", CHUNK + MIB);
  await pick(page, big);
  await expect
    .poll(async () => (await mySessions())[0]?.bytesReceived ?? 0)
    .toBe(CHUNK);
  await page.reload();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await expect(page.getByTestId("media-gallery")).toBeVisible();

  const t = utile(page, "big.mp4");
  await expect(t).toHaveAttribute("data-status", "readd");
  await expect(t.getByTestId("upload-readd")).toHaveText("Re-add to finish");
  await expect(page.getByTestId("upload-keep-open")).toHaveCount(0);

  const puts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT") puts.push(r.headers()["content-range"] ?? "");
  });
  await pick(page, big);
  await expect(t).toHaveAttribute("data-status", "done");
  // Only the missing tail was sent, on the same session.
  expect(puts).toEqual([`bytes ${CHUNK}-${CHUNK + MIB - 1}/${CHUNK + MIB}`]);
  expect(await mySessions()).toHaveLength(1);
  expect(
    (await mediaState()).unsorted.filter((i) => i.name === "big.mp4"),
  ).toHaveLength(1);
});

test("a file type the API rejects shows an error on that item", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const txt = join(dir, "notes.txt");
  writeFileSync(txt, "hello");
  await pick(page, txt);
  const t = utile(page, "notes.txt");
  await expect(t).toHaveAttribute("data-status", "error");
  await expect(t.getByTestId("upload-error")).toContainText("not supported");
});

test("the screen wake lock is held while uploading and released after", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __wl: { requested: number; released: number };
    };
    w.__wl = { requested: 0, released: 0 };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          w.__wl.requested++;
          return { release: async () => void w.__wl.released++ };
        },
      },
    });
  });
  await openGallery(page, m.gigId);
  const release = await holdChunks(page);
  await pick(page, makeFile("w.png", 4000));
  await expect(page.getByTestId("upload-keep-open")).toHaveText(
    "Keep this page open until uploads finish",
  );
  const wl = () =>
    page.evaluate(
      () =>
        (window as unknown as { __wl: { requested: number; released: number } })
          .__wl,
    );
  await expect.poll(async () => (await wl()).requested).toBeGreaterThan(0);
  expect((await wl()).released).toBe(0);
  release();
  await expect(utile(page, "w.png")).toHaveAttribute("data-status", "done");
  await expect.poll(async () => (await wl()).released).toBeGreaterThan(0);
  await expect(page.getByTestId("upload-keep-open")).toHaveCount(0);
});

/** A real JPEG (drawn in the page) with an EXIF Orientation=6 APP1 segment spliced in. */
async function exifJpeg(page: Page, orientation: number): Promise<string> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 20;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e33";
    g.fillRect(0, 0, 40, 20);
    const blob: Blob = await new Promise((r) =>
      c.toBlob((b) => r(b!), "image/jpeg"),
    );
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (const x of buf) bin += String.fromCharCode(x);
    return btoa(bin);
  });
  const jpeg = Buffer.from(b64, "base64");
  const exif = Buffer.from([
    0xff,
    0xe1,
    0x00,
    0x22,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const out = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
  const path = join(dir, `exif-${orientation}.jpg`);
  writeFileSync(path, out);
  return path;
}

test("EXIF-rotated photos preview upright and the uploaded file is untouched", async ({
  page,
}) => {
  await openGallery(page, m.gigId);
  const path = await exifJpeg(page, 6);
  const release = await holdChunks(page);
  await pick(page, path);
  const img = utile(page, "exif-6.jpg").locator("img");
  await expect(img).toBeVisible();
  await expect
    .poll(() =>
      img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(await img.evaluate((e) => getComputedStyle(e).imageOrientation)).toBe(
    "from-image",
  );
  // Orientation 6 swaps the displayed size: the 40x20 file shows as 20x40.
  expect(
    await img.evaluate((e: HTMLImageElement) => [
      e.naturalWidth,
      e.naturalHeight,
    ]),
  ).toEqual([20, 40]);
  release();
  await expect(utile(page, "exif-6.jpg")).toHaveAttribute(
    "data-status",
    "done",
  );
  const stored = (await m.fake.files()).find((f) => f.name === "exif-6.jpg")!;
  expect(
    Buffer.from(await m.fake.content(stored.id)).equals(readFileSync(path)),
  ).toBe(true);
});

test("dropping files on the gallery uploads them", async ({ page }) => {
  await openGallery(page, m.gigId);
  await page.getByTestId("media-gallery").evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array(3000)], "dropped.png", { type: "image/png" }),
    );
    el.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(utile(page, "dropped.png")).toBeVisible();
});

test("Add media in the gig drawer picks files and opens the full view", async ({
  page,
}) => {
  await page.goto(`/gigs/${m.gigId}`);
  const drawer = page.getByRole("dialog", { name: m.gigTitle }).last();
  await drawer
    .getByTestId("media-add-input")
    .setInputFiles(makeFile("d.png", 3000));
  await expect(page).toHaveURL(new RegExp(`/gigs/${m.gigId}/media$`));
  await expect(utile(page, "d.png")).toBeVisible();
});

for (const vp of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`screenshots at ${vp.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGallery(page, m.gigId);
    await dropLaterChunks(page);
    const files = [
      makeFile("encore.mp4", CHUNK + MIB),
      makeFile("soundcheck.mp4", CHUNK + MIB, 2),
      makeFile("crowd.png", 4000, 3),
    ];
    await pick(page, files);
    await expect
      .poll(
        async () =>
          (await mySessions()).filter((s) => s.bytesReceived === CHUNK).length,
      )
      .toBe(2);
    await expect(
      utile(page, "encore.mp4").getByTestId("upload-progress"),
    ).toHaveAttribute("data-progress", /^(8|9)\d$/);
    await page.screenshot({ path: `${SHOTS}/tray-mid-upload-${vp.name}.png` });

    await utile(page, "encore.mp4").getByTestId("upload-open").click();
    await utile(page, "crowd.png").getByTestId("upload-open").click();
    await expect(page.getByTestId("selection-count")).toHaveText("2");
    await page.screenshot({ path: `${SHOTS}/tray-selection-${vp.name}.png` });

    await page.reload();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect(utile(page, "encore.mp4")).toHaveAttribute(
      "data-status",
      "readd",
    );
    await page.screenshot({ path: `${SHOTS}/tray-readd-${vp.name}.png` });
  });
}
