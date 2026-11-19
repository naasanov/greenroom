import {
  SONGS,
  USERS,
  mediaItems,
  publicUploadLinks,
  uploadSessions,
} from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import {
  BAND,
  FakeDrive,
  anon,
  clientFor,
  setupDrive,
} from "./api-media-helpers.js";
import { GIG, bytes, sessionUrl } from "./api-uploads-helpers.js";
import {
  CORRUPT_HEIC,
  HEIC,
  UNPARSEABLE_HEIC,
  isJpeg,
  uploadGigFile,
  withDimensions,
} from "./heic-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const MIB = 1024 * 1024;
const FILES_UPLOADS = `/bands/${BAND}/files/uploads`;

async function setup(testApi: TestApi) {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  return { ava, fake, root: status.folderId as string };
}

/** Non-folder Drive files, by name. */
async function driveNames(fake: FakeDrive): Promise<string[]> {
  return (await fake.files())
    .filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder" && !f.trashed,
    )
    .map((f) => f.name)
    .sort();
}

for (const mimeType of ["application/octet-stream", "image/heic"]) {
  test(`gig upload of a .HEIC (${mimeType}) is replaced by one JPEG`, async ({
    testApi,
    db,
  }) => {
    const { ava, fake } = await setup(testApi);
    const done = await uploadGigFile(ava, HEIC, "IMG_0001.HEIC", mimeType);
    expect(done.status).toBe("complete");
    expect(done.item).toMatchObject({ name: "IMG_0001.jpg" });

    expect(await driveNames(fake)).toEqual(["IMG_0001.jpg"]);
    const file = (await fake.byName("IMG_0001.jpg"))!;
    expect(file.mimeType).toBe("image/jpeg");
    const stored = await fake.content(file.id);
    expect(isJpeg(stored)).toBe(true);

    const rows = await db.select().from(mediaItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "IMG_0001.jpg",
      mimeType: "image/jpeg",
      sizeBytes: stored.length,
      driveFileId: file.id,
      nameCustomized: false,
      missing: false,
    });
    expect(rows[0]!.thumbnailUrl).not.toBeNull();

    // The item serves the JPEG.
    const content = await ava.get(
      `/bands/${BAND}/media/${rows[0]!.id}/content`,
    );
    expect(content.headers()["content-type"]).toBe("image/jpeg");
    expect(Buffer.from(await content.body())).toEqual(stored);
  });
}

test("a HEIC with an extension and no usable type is accepted and converted, a clash gets a (2) suffix", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  await uploadGigFile(ava, bytes(900, 3), "IMG_7.jpg", "image/jpeg");
  const done = await uploadGigFile(
    ava,
    HEIC,
    "IMG_7.heif",
    "application/octet-stream",
  );
  expect(done.item).toMatchObject({ name: "IMG_7 (2).jpg" });
  expect(await driveNames(fake)).toEqual(["IMG_7 (2).jpg", "IMG_7.jpg"]);
  // A non-image with a generic type is still refused.
  const res = await ava.post(`/bands/${BAND}/gigs/${GIG}/uploads`, {
    data: {
      fileName: "notes.bin",
      mimeType: "application/octet-stream",
      totalBytes: 10,
      fingerprint: "bin",
      folderId: null,
    },
  });
  expect(res.status()).toBe(422);
});

test("a song link after conversion renames to the title with a .jpg extension", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const done = await uploadGigFile(ava, HEIC, "a.HEIC", "image/heic");
  const res = await ava.put(`/bands/${BAND}/media/items/song`, {
    data: { itemIds: [done.item!.id], songId: SONGS.skyline.id },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(await driveNames(fake)).toEqual([`${SONGS.skyline.title}.jpg`]);
});

test("Files-tab upload of a .HEIC leaves one JPEG and no media item", async ({
  testApi,
  db,
}) => {
  const { ava, fake, root } = await setup(testApi);
  const create = await ava.post(FILES_UPLOADS, {
    data: {
      fileName: "Photo.HEIC",
      mimeType: "application/octet-stream",
      totalBytes: HEIC.length,
      fingerprint: "photo-heic",
      folderId: "root",
    },
  });
  expect(create.status(), await create.text()).toBe(200);
  const s = await create.json();
  const put = await ava.put(sessionUrl(s.id), {
    data: HEIC,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes 0-${HEIC.length - 1}/${HEIC.length}`,
    },
  });
  expect(put.status(), await put.text()).toBe(200);
  const done = await put.json();
  expect(done.status).toBe("complete");
  expect(done.file).toMatchObject({
    name: "Photo.jpg",
    mimeType: "image/jpeg",
  });
  expect(await driveNames(fake)).toEqual(["Photo.jpg"]);
  const file = (await fake.byName("Photo.jpg"))!;
  expect(file.parentId).toBe(root);
  const stored = await fake.content(file.id);
  expect(isJpeg(stored)).toBe(true);
  expect(done.file.sizeBytes).toBe(stored.length);
  expect(await db.select().from(mediaItems)).toHaveLength(0);
});

test("a corrupt HEIC still uploads and the original is kept", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  const done = await uploadGigFile(ava, CORRUPT_HEIC, "bad.heic", "image/heic");
  expect(done.status).toBe("complete");
  expect(done.item).toMatchObject({ name: "bad.heic", mimeType: "image/heic" });
  expect(await driveNames(fake)).toEqual(["bad.heic"]);
  const file = (await fake.byName("bad.heic"))!;
  expect(await fake.content(file.id)).toEqual(CORRUPT_HEIC);
  const [row] = await db.select().from(mediaItems);
  expect(row).toMatchObject({ name: "bad.heic", mimeType: "image/heic" });

  // Without a usable type the item is still typed as an image.
  const generic = await uploadGigFile(
    ava,
    CORRUPT_HEIC,
    "worse.HEIC",
    "application/octet-stream",
  );
  expect(generic.item).toMatchObject({
    name: "worse.HEIC",
    mimeType: "image/heic",
  });
});

test("a HEIC over the size cap is kept and never downloaded", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const big = Buffer.alloc(50 * MIB + 1, 7);
  await fake.calls(true);
  const done = await uploadGigFile(
    ava,
    big,
    "huge.heic",
    "image/heic",
    8 * MIB,
  );
  expect(done.status).toBe("complete");
  expect(done.item).toMatchObject({
    name: "huge.heic",
    mimeType: "image/heic",
  });
  expect(await driveNames(fake)).toEqual(["huge.heic"]);
  expect(await fake.calls()).not.toContain("download");
  expect(await fake.calls()).not.toContain("updateContent");
});

test("a HEIC whose dimensions are above the pixel cap is kept and not rewritten", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  // 5000x5000 is 25 MP, over the 16 MP cap.
  const huge = withDimensions(HEIC, 5000, 5000);
  await fake.calls(true);
  const done = await uploadGigFile(ava, huge, "pano.heic", "image/heic");
  expect(done.status).toBe("complete");
  expect(done.item).toMatchObject({
    name: "pano.heic",
    mimeType: "image/heic",
  });
  expect(await driveNames(fake)).toEqual(["pano.heic"]);
  expect(await fake.calls()).not.toContain("updateContent");
  const file = (await fake.byName("pano.heic"))!;
  expect(await fake.content(file.id)).toEqual(huge);
});

test("a HEIC whose dimensions cannot be parsed is kept", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  await fake.calls(true);
  const done = await uploadGigFile(
    ava,
    UNPARSEABLE_HEIC,
    "junk.heic",
    "image/heic",
  );
  expect(done.status).toBe("complete");
  expect(done.item).toMatchObject({
    name: "junk.heic",
    mimeType: "image/heic",
  });
  expect(await driveNames(fake)).toEqual(["junk.heic"]);
  expect(await fake.calls()).not.toContain("updateContent");
  const file = (await fake.byName("junk.heic"))!;
  expect(await fake.content(file.id)).toEqual(UNPARSEABLE_HEIC);
});

test("a public upload link limited to other types rejects a .heic", async ({
  testApi,
  db,
}) => {
  const { ava } = await setup(testApi);
  const link = await (
    await ava.post(`/bands/${BAND}/gigs/${GIG}/upload-links`, { data: {} })
  ).json();
  const token = link.url.split("/u/")[1] as string;
  const pub = await anon();
  const create = (fileName: string, mimeType: string, n: number) =>
    pub.post(`/public/upload-links/${token}/uploads`, {
      data: {
        fileName,
        mimeType,
        totalBytes: HEIC.length,
        fingerprint: `f${n}`,
      },
    });

  // The default link accepts images, including an untyped .heic.
  expect((await create("a.heic", "image/heic", 1)).status()).toBe(200);
  expect((await create("b.HEIC", "application/octet-stream", 2)).status()).toBe(
    200,
  );

  await db.update(publicUploadLinks).set({ allowedMimePrefixes: ["video/"] });
  for (const [i, [name, type]] of (
    [
      ["d.heic", "image/heic"],
      ["e.HEIC", "application/octet-stream"],
      ["f.heif", "application/octet-stream"],
    ] as const
  ).entries()) {
    const res = await create(name, type, 10 + i);
    expect(res.status(), name).toBe(422);
    expect((await res.json()).code).toBe("UPLOAD_TYPE_NOT_ALLOWED");
  }
  expect((await create("clip.mp4", "video/mp4", 20)).status()).toBe(200);
});

test("finalize retried after the conversion already ran keeps the JPEG name", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  const done = await uploadGigFile(ava, HEIC, "retry.HEIC", "image/heic");
  expect(done.item).toMatchObject({ name: "retry.jpg" });

  // Put the session back as if the final DB write had failed, then resume it.
  await db.update(uploadSessions).set({ status: "uploading" });
  const again = await ava.post(`/bands/${BAND}/gigs/${GIG}/uploads`, {
    data: {
      fileName: "retry.HEIC",
      mimeType: "image/heic",
      totalBytes: HEIC.length,
      fingerprint: `retry.HEIC:${HEIC.length}`,
      folderId: null,
    },
  });
  expect(again.status(), await again.text()).toBe(200);
  const s = await again.json();
  expect(s.status).toBe("complete");
  expect(s.item).toMatchObject({ name: "retry.jpg", mimeType: "image/jpeg" });
  expect(await driveNames(fake)).toEqual(["retry.jpg"]);
  const file = (await fake.byName("retry.jpg"))!;
  expect(isJpeg(await fake.content(file.id))).toBe(true);
  const rows = await db.select().from(mediaItems);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: "retry.jpg",
    mimeType: "image/jpeg",
    sizeBytes: (await fake.content(file.id)).length,
  });

  // The Files tab path behaves the same way.
  const body = {
    fileName: "again.HEIC",
    mimeType: "application/octet-stream",
    totalBytes: HEIC.length,
    fingerprint: "again-heic",
    folderId: "root",
  };
  const create = await ava.post(FILES_UPLOADS, { data: body });
  const fs = await create.json();
  await ava.put(sessionUrl(fs.id), {
    data: HEIC,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes 0-${HEIC.length - 1}/${HEIC.length}`,
    },
  });
  await db
    .update(uploadSessions)
    .set({ status: "uploading" })
    .where(eq(uploadSessions.id, fs.id));
  const resumed = await ava.post(FILES_UPLOADS, { data: body });
  expect(resumed.status(), await resumed.text()).toBe(200);
  expect(await resumed.json()).toMatchObject({
    status: "complete",
    file: { name: "again.jpg", mimeType: "image/jpeg" },
  });
  expect(await driveNames(fake)).toEqual(["again.jpg", "retry.jpg"]);
});

test("the poller converts a HEIC added in Drive once and re-polling leaves it alone", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  await ava.post(`/bands/${BAND}/gigs/${GIG}/media/folders`, {
    data: { name: "Stage" },
  });
  const files = await fake.files();
  const gigFolder = files.find((f) => /^\d\d-\d\d-\d\d /.test(f.name))!;
  const stage = files.find((f) => f.name === "Stage")!;
  await fake.poll();

  await fake.external({
    action: "add",
    name: "drop.HEIC",
    parentId: gigFolder.id,
    mimeType: "image/heic",
    contentBase64: HEIC.toString("base64"),
  });
  await fake.external({
    action: "add",
    name: "mac.heif",
    parentId: stage.id,
    mimeType: "application/octet-stream",
    contentBase64: HEIC.toString("base64"),
  });
  await fake.external({
    action: "add",
    name: "broken.heic",
    parentId: gigFolder.id,
    mimeType: "image/heic",
    contentBase64: CORRUPT_HEIC.toString("base64"),
  });
  const first = await fake.poll();
  expect(first[0].status).toBe("polled");
  expect(await driveNames(fake)).toEqual([
    "broken.heic",
    "drop.jpg",
    "mac.jpg",
  ]);
  const rows = await db.select().from(mediaItems);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  expect(Object.keys(byName).sort()).toEqual([
    "broken.heic",
    "drop.jpg",
    "mac.jpg",
  ]);
  expect(byName["drop.jpg"]).toMatchObject({
    mimeType: "image/jpeg",
    nameCustomized: false,
    folderId: null,
  });
  expect(byName["mac.jpg"]).toMatchObject({
    mimeType: "image/jpeg",
    nameCustomized: false,
  });
  expect(byName["mac.jpg"]!.folderId).not.toBeNull();
  expect(byName["broken.heic"]).toMatchObject({ mimeType: "image/heic" });
  const dropFile = (await fake.byName("drop.jpg"))!;
  const converted = await fake.content(dropFile.id);
  expect(isJpeg(converted)).toBe(true);
  expect(byName["drop.jpg"]!.sizeBytes).toBe(converted.length);

  // The conversion itself is one more change; it must not convert again or flag a rename.
  await fake.calls(true);
  const second = await fake.poll();
  expect(second[0].changes).toBeGreaterThan(0);
  const third = await fake.poll();
  expect(third[0].changes).toBe(0);
  const calls = await fake.calls();
  expect(calls).not.toContain("updateContent");
  expect(calls).not.toContain("download");
  expect(await fake.content(dropFile.id)).toEqual(converted);
  const after = await db.select().from(mediaItems);
  expect(after.map((r) => r.name).sort()).toEqual([
    "broken.heic",
    "drop.jpg",
    "mac.jpg",
  ]);
  expect(after.every((r) => !r.nameCustomized)).toBe(true);
});

test("backfill converts existing HEIC items, keeps failures, and is safe to re-run", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  await ava.post(`/bands/${BAND}/gigs/${GIG}/media/folders`, {
    data: { name: "tmp" },
  });
  const gigFolder = (await fake.files()).find((f) =>
    /^\d\d-\d\d-\d\d /.test(f.name),
  )!;
  await fake.poll();
  // Ingested as non-HEIC, then turned into HEIC items directly so the poller does not convert them.
  const add = async (name: string, content: Buffer) =>
    (await fake.external({
      action: "add",
      name: `${name}.bin`,
      parentId: gigFolder.id,
      mimeType: "application/octet-stream",
      contentBase64: content.toString("base64"),
    })) as { id: string };
  const good = await add("old.HEIC", HEIC);
  const rotten = await add("rotten.HEIC", CORRUPT_HEIC);
  await fake.poll();
  for (const [f, name] of [
    [good, "old.HEIC"],
    [rotten, "rotten.HEIC"],
  ] as const) {
    await fake.external({ action: "rename", fileId: f.id, name });
    await db
      .update(mediaItems)
      .set({ name, mimeType: "image/heic" })
      .where(eq(mediaItems.driveFileId, f.id));
  }
  const goodId = good.id;
  const api = await anon();
  const run = async (dryRun = false) =>
    (
      await api.post("/__test__/media/heic-backfill", {
        params: dryRun ? { dryRun: "1" } : {},
      })
    ).json();

  expect(await run(true)).toMatchObject({
    dryRun: true,
    found: 2,
    converted: 0,
  });
  expect(await driveNames(fake)).toEqual(["old.HEIC", "rotten.HEIC"]);

  expect(await run()).toMatchObject({ found: 2, converted: 1, kept: 1 });
  expect(await driveNames(fake)).toEqual(["old.jpg", "rotten.HEIC"]);
  const stored = await fake.content(goodId);
  expect(isJpeg(stored)).toBe(true);
  const [row] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.driveFileId, goodId));
  expect(row).toMatchObject({
    name: "old.jpg",
    mimeType: "image/jpeg",
    sizeBytes: stored.length,
  });

  // Re-run: only the file that could not convert is looked at again.
  await fake.calls(true);
  expect(await run()).toMatchObject({ found: 1, converted: 0, kept: 1 });
  expect(await fake.calls()).not.toContain("updateContent");
  expect(await fake.content(goodId)).toEqual(stored);

  // The poller sees the conversion as a plain change and keeps the item as is.
  await fake.poll();
  await fake.poll();
  const [after] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.driveFileId, goodId));
  expect(after).toMatchObject({ name: "old.jpg", nameCustomized: false });
});

test("backfill repairs a row whose Drive file is already a JPEG", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  await ava.post(`/bands/${BAND}/gigs/${GIG}/media/folders`, {
    data: { name: "tmp" },
  });
  const gigFolder = (await fake.files()).find((f) =>
    /^\d\d-\d\d-\d\d /.test(f.name),
  )!;
  await fake.poll();
  const half = (await fake.external({
    action: "add",
    name: "half.jpg",
    parentId: gigFolder.id,
    mimeType: "image/jpeg",
    contentBase64: Buffer.from("jpeg bytes").toString("base64"),
  })) as { id: string };
  await fake.poll();
  // The row still describes the HEIC it was before the Drive file became a JPEG.
  await db
    .update(mediaItems)
    .set({ name: "half.HEIC", mimeType: "image/heic", sizeBytes: 1 })
    .where(eq(mediaItems.driveFileId, half.id));

  const res = await (
    await (await anon()).post("/__test__/media/heic-backfill")
  ).json();
  expect(res).toMatchObject({ found: 1, converted: 1, kept: 0 });
  const [row] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.driveFileId, half.id));
  expect(row).toMatchObject({
    name: "half.jpg",
    mimeType: "image/jpeg",
    sizeBytes: "jpeg bytes".length,
  });
  expect(await driveNames(fake)).toEqual(["half.jpg"]);
});
