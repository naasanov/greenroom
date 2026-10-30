import { SONGS, USERS, uploadSessions } from "@greenroom/db";
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
import {
  CHUNK,
  GIG,
  bytes,
  createBody,
  createUpload,
  putChunk,
  sendRange,
  sessionUrl,
  uploadsUrl,
} from "./api-uploads-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const media = `/bands/${BAND}/gigs/${GIG}/media`;

async function setup(testApi: TestApi) {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  return { ava, fake };
}

test("multi-chunk upload lands in Unsorted and the fake Drive with the right bytes", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const data = bytes(CHUNK * 2 + 1234, 7);
  const s = await createUpload(ava, data);
  expect(s).toMatchObject({
    status: "pending",
    bytesReceived: 0,
    totalBytes: data.length,
    chunkSize: 8 * 1024 * 1024,
    folderId: null,
    item: null,
  });
  const mid = await (await putChunk(ava, s.id, data, 0, CHUNK)).json();
  expect(mid).toMatchObject({ status: "uploading", bytesReceived: CHUNK });
  const polled = await (await ava.get(sessionUrl(s.id))).json();
  expect(polled.bytesReceived).toBe(CHUNK);

  const done = await sendRange(ava, s.id, data, CHUNK);
  expect(done.status).toBe("complete");
  expect(done.item).toMatchObject({ name: "clip.mp4" });

  const gigMedia = await (await ava.get(media)).json();
  expect(gigMedia.unsorted.map((i: { id: string }) => i.id)).toEqual([
    done.item!.id,
  ]);
  const file = (await fake.files()).find((f) => f.name === "clip.mp4")!;
  const gigFolder = (await fake.files()).find((f) => f.id === file.parentId)!;
  expect(gigFolder.name).toMatch(/^\d\d-\d\d-\d\d /);
  expect(await fake.content(file.id)).toEqual(data);

  // Chunks sent after completion are idempotent.
  const again = await putChunk(ava, s.id, data, 0, CHUNK);
  expect((await again.json()).status).toBe("complete");
});

test("upload into a subfolder", async ({ testApi }) => {
  const { ava, fake } = await setup(testApi);
  const folder = await (
    await ava.post(`${media}/folders`, { data: { name: "Stage" } })
  ).json();
  const data = bytes(CHUNK + 10, 2);
  const s = await createUpload(ava, data, {
    folderId: folder.id,
    fileName: "a.png",
    mimeType: "image/png",
  });
  expect(s.folderId).toBe(folder.id);
  const done = await sendRange(ava, s.id, data, 0);
  const gm = await (await ava.get(media)).json();
  expect(gm.folders[0].items.map((i: { id: string }) => i.id)).toEqual([
    done.item!.id,
  ]);
  expect(gm.unsorted).toHaveLength(0);
  const stage = (await fake.byName("Stage"))!;
  expect((await fake.byName("a.png"))!.parentId).toBe(stage.id);

  const other = await ava.post(uploadsUrl(), {
    data: createBody(data, {
      folderId: "00000000-0000-4000-8000-000000000000",
      fingerprint: "x",
    }),
  });
  expect(other.status()).toBe(422);
});

test("resume after an interrupted chunk and after the client restarts", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const data = bytes(CHUNK * 4, 3);
  const api = await anon();
  const s = await createUpload(ava, data);
  await sendRange(ava, s.id, data, 0, CHUNK);

  // Drive keeps only half a chunk, then the connection drops.
  const half = CHUNK / 2;
  expect(
    (
      await api.post(`/__test__/media/uploads/${s.id}/interrupt`, {
        data: { acceptBytes: half },
      })
    ).status(),
  ).toBe(200);
  const failed = await putChunk(ava, s.id, data, CHUNK, CHUNK * 2);
  expect(failed.status()).toBe(502);
  const body = await failed.json();
  expect(body).toMatchObject({
    code: "UPLOAD_DRIVE_ERROR",
    bytesReceived: CHUNK + half,
  });

  // A stale offset is rejected with the authoritative one.
  const stale = await putChunk(ava, s.id, data, CHUNK, CHUNK * 2);
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({
    code: "UPLOAD_OFFSET_MISMATCH",
    bytesReceived: CHUNK + half,
  });

  // The client restarts: same fingerprint resumes the same session.
  const resumed = await createUpload(ava, data);
  expect(resumed).toMatchObject({
    id: s.id,
    status: "uploading",
    bytesReceived: CHUNK + half,
  });
  const done = await sendRange(ava, s.id, data, resumed.bytesReceived);
  expect(done.status).toBe("complete");
  const file = (await fake.byName("clip.mp4"))!;
  expect(await fake.content(file.id)).toEqual(data);
});

test("re-adding a completed file skips it; cancelled starts fresh", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const data = bytes(CHUNK + 5, 4);
  const s = await createUpload(ava, data);
  const done = await sendRange(ava, s.id, data, 0);

  const skipped = await createUpload(ava, data);
  expect(skipped).toMatchObject({ id: s.id, status: "complete" });
  expect(skipped.item!.id).toBe(done.item!.id);
  expect(
    (await fake.files()).filter((f) => f.name === "clip.mp4"),
  ).toHaveLength(1);

  // Trashing the item makes the fingerprint uploadable again.
  await ava.post(`/bands/${BAND}/media/trash`, {
    data: { itemIds: [done.item!.id] },
  });
  const fresh = await createUpload(ava, data);
  expect(fresh.id).not.toBe(s.id);
  expect(fresh.status).toBe("pending");

  const cancelled = await ava.delete(sessionUrl(fresh.id));
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).status).toBe("cancelled");
  const blocked = await putChunk(ava, fresh.id, data, 0, CHUNK);
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toMatchObject({ code: "UPLOAD_NOT_ACTIVE" });
  const again = await createUpload(ava, data);
  expect(again.id).not.toBe(fresh.id);
  expect(again.bytesReceived).toBe(0);
});

test("offset mismatch reports the server offset", async ({ testApi }) => {
  const { ava } = await setup(testApi);
  const data = bytes(CHUNK * 3, 5);
  const s = await createUpload(ava, data);
  await sendRange(ava, s.id, data, 0, CHUNK);
  const res = await putChunk(ava, s.id, data, CHUNK * 2, CHUNK * 3);
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({
    code: "UPLOAD_OFFSET_MISMATCH",
    bytesReceived: CHUNK,
  });
  const bad = await ava.put(sessionUrl(s.id), {
    data: data.subarray(0, 100),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes 0-99/${data.length}`,
    },
  });
  expect(bad.status()).toBe(422);
  expect(await bad.json()).toMatchObject({ code: "UPLOAD_BAD_CHUNK" });
  const nohdr = await ava.put(sessionUrl(s.id), {
    data: data.subarray(0, 100),
    headers: { "Content-Type": "application/octet-stream" },
  });
  expect(nohdr.status()).toBe(400);
});

test("an expired Drive session restarts from zero", async ({ testApi }) => {
  const { ava, fake } = await setup(testApi);
  const data = bytes(CHUNK * 2, 6);
  const api = await anon();
  const s = await createUpload(ava, data);
  await sendRange(ava, s.id, data, 0, CHUNK);
  await api.post(`/__test__/media/uploads/${s.id}/expire`);

  const res = await putChunk(ava, s.id, data, CHUNK, CHUNK * 2);
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({
    code: "UPLOAD_OFFSET_MISMATCH",
    bytesReceived: 0,
  });
  const done = await sendRange(ava, s.id, data, 0);
  expect(done.status).toBe("complete");
  expect(await fake.content((await fake.byName("clip.mp4"))!.id)).toEqual(data);

  // Expiry found while re-adding also restarts.
  const data2 = bytes(CHUNK * 2, 8);
  const s2 = await createUpload(ava, data2, { fingerprint: "two" });
  await sendRange(ava, s2.id, data2, 0, CHUNK);
  await api.post(`/__test__/media/uploads/${s2.id}/expire`);
  const re = await createUpload(ava, data2, { fingerprint: "two" });
  expect(re).toMatchObject({ id: s2.id, bytesReceived: 0 });
});

test("folder, name and song edits while uploading apply on completion", async ({
  testApi,
  db,
}) => {
  const { ava, fake } = await setup(testApi);
  const folder = await (
    await ava.post(`${media}/folders`, { data: { name: "Crowd" } })
  ).json();
  const data = bytes(CHUNK + 99, 9);
  const s = await createUpload(ava, data, {
    fileName: "take1.mov",
    mimeType: "video/quicktime",
  });
  await sendRange(ava, s.id, data, 0, CHUNK);

  const patched = await ava.patch(sessionUrl(s.id), {
    data: { folderId: folder.id, songId: SONGS.skyline.id },
  });
  expect(patched.status()).toBe(200);
  expect(await patched.json()).toMatchObject({
    folderId: folder.id,
    songId: SONGS.skyline.id,
  });
  const done = await sendRange(ava, s.id, data, CHUNK);
  // Not customized: the song rename rule applies.
  expect(done.item).toMatchObject({
    name: "Skyline Drive.mov",
    songId: SONGS.skyline.id,
  });
  const crowd = (await fake.byName("Crowd"))!;
  const file = (await fake.byName("Skyline Drive.mov"))!;
  expect(file.parentId).toBe(crowd.id);
  const [row] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, s.id));
  expect(row!.mediaItemId).toBe(done.item!.id);

  // A custom name wins over the song rule.
  const data2 = bytes(CHUNK + 3, 10);
  const s2 = await createUpload(ava, data2, {
    fileName: "take2.mov",
    mimeType: "video/quicktime",
    fingerprint: "take2",
  });
  await ava.patch(sessionUrl(s2.id), {
    data: { fileName: "my take.mov", songId: SONGS.skyline.id },
  });
  const done2 = await sendRange(ava, s2.id, data2, 0);
  expect(done2.item).toMatchObject({
    name: "my take.mov",
    songId: SONGS.skyline.id,
  });
  expect(await fake.byName("my take.mov")).toBeTruthy();

  // Edits after completion go straight to the media item.
  const after = await ava.patch(sessionUrl(s2.id), {
    data: { folderId: null, fileName: "renamed.mov" },
  });
  expect(after.status()).toBe(200);
  const gm = await (await ava.get(media)).json();
  expect(gm.unsorted.map((i: { name: string }) => i.name)).toEqual([
    "renamed.mov",
  ]);
  expect((await fake.byName("renamed.mov"))!.parentId).not.toBe(crowd.id);

  const empty = await ava.patch(sessionUrl(s2.id), { data: {} });
  expect(empty.status()).toBe(400);
});

test("bulk patch sets folder and song on several uploads", async ({
  testApi,
}) => {
  const { ava, fake } = await setup(testApi);
  const folder = await (
    await ava.post(`${media}/folders`, { data: { name: "Stage" } })
  ).json();
  const a = bytes(CHUNK + 1, 11);
  const b = bytes(CHUNK + 2, 12);
  const sa = await createUpload(ava, a, {
    fileName: "a.mp3",
    mimeType: "audio/mpeg",
    fingerprint: "a",
  });
  const sb = await createUpload(ava, b, {
    fileName: "b.mp3",
    mimeType: "audio/mpeg",
    fingerprint: "b",
  });
  const res = await ava.patch(`/bands/${BAND}/uploads`, {
    data: {
      ids: [sa.id, sb.id],
      folderId: folder.id,
      songId: SONGS.skyline.id,
    },
  });
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list).toHaveLength(2);
  expect(
    list.every((x: { folderId: string }) => x.folderId === folder.id),
  ).toBe(true);
  await sendRange(ava, sa.id, a, 0);
  await sendRange(ava, sb.id, b, 0);
  const gm = await (await ava.get(media)).json();
  expect(
    gm.folders[0].items.map((i: { name: string }) => i.name).sort(),
  ).toEqual(["Skyline Drive (2).mp3", "Skyline Drive.mp3"]);
  expect(await fake.byName("Skyline Drive.mp3")).toBeTruthy();

  const missing = await ava.patch(`/bands/${BAND}/uploads`, {
    data: {
      ids: [sa.id, "00000000-0000-4000-8000-000000000000"],
      songId: null,
    },
  });
  expect(missing.status()).toBe(404);
});

test("type, size, link and membership checks", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const data = bytes(1000);
  const unlinked = await ava.post(uploadsUrl(), { data: createBody(data) });
  expect(unlinked.status()).toBe(409);
  expect(await unlinked.json()).toMatchObject({ code: "GOOGLE_NOT_LINKED" });

  await setupDrive(ava);
  const exe = await ava.post(uploadsUrl(), {
    data: createBody(data, { mimeType: "application/x-msdownload" }),
  });
  expect(exe.status()).toBe(422);
  expect(await exe.json()).toMatchObject({ code: "UPLOAD_TYPE_NOT_ALLOWED" });
  for (const mimeType of ["application/pdf", "audio/wav", "image/heic"]) {
    const ok = await ava.post(uploadsUrl(), {
      data: createBody(data, { mimeType, fingerprint: mimeType }),
    });
    expect(ok.status()).toBe(200);
  }
  const huge = await ava.post(uploadsUrl(), {
    data: createBody(data, { totalBytes: 11 * 1024 ** 3 }),
  });
  expect(huge.status()).toBe(422);
  expect(await huge.json()).toMatchObject({ code: "UPLOAD_TOO_LARGE" });

  const outsider = await clientFor(testApi, "outsider@example.com");
  expect(
    (await outsider.post(uploadsUrl(), { data: createBody(data) })).status(),
  ).toBe(404);
  expect((await outsider.get(uploadsUrl() + "?mine=1")).status()).toBe(404);

  // Another member cannot touch Ava's session.
  const s = await createUpload(ava, data, { fingerprint: "own" });
  const ben = await clientFor(testApi, USERS.ben.email);
  expect((await ben.get(sessionUrl(s.id))).status()).toBe(404);
  expect((await ben.delete(sessionUrl(s.id))).status()).toBe(404);
  expect((await putChunk(ben, s.id, data, 0, 1000)).status()).toBe(404);
});

test("mine=1 lists the caller's recent uploads and stale ones fail", async ({
  testApi,
}) => {
  const { ava } = await setup(testApi);
  const ben = await clientFor(testApi, USERS.ben.email);
  const api = await anon();
  const a = bytes(CHUNK + 1, 21);
  const b = bytes(CHUNK + 2, 22);
  const c = bytes(CHUNK + 3, 23);
  const sa = await createUpload(ava, a, {
    fingerprint: "a",
    fileName: "a.mp4",
  });
  await sendRange(ava, sa.id, a, 0);
  const sb = await createUpload(ava, b, {
    fingerprint: "b",
    fileName: "b.mp4",
  });
  await sendRange(ava, sb.id, b, 0, CHUNK);
  const sc = await createUpload(ava, c, {
    fingerprint: "c",
    fileName: "c.mp4",
  });
  await ava.delete(sessionUrl(sc.id));
  await createUpload(ben, a, { fingerprint: "a", fileName: "ben.mp4" });

  const list = await (await ava.get(uploadsUrl() + "?mine=1")).json();
  expect(list.map((s: { fileName: string }) => s.fileName)).toEqual([
    "b.mp4",
    "a.mp4",
  ]);
  expect(list[1].item).toMatchObject({ name: "a.mp4" });
  expect(list[0]).toMatchObject({
    status: "uploading",
    bytesReceived: CHUNK,
    item: null,
  });

  // Older than 7 days: cleanup marks it failed and the list drops it.
  await api.post(`/__test__/media/uploads/${sb.id}/age`, { data: { days: 8 } });
  expect(
    (await (await api.post("/__test__/media/uploads/cleanup")).json()).failed,
  ).toBe(1);
  const after = await (await ava.get(uploadsUrl() + "?mine=1")).json();
  expect(after.map((s: { fileName: string }) => s.fileName)).toEqual(["a.mp4"]);

  // A recent failed session is listed and still resumable.
  const d = bytes(CHUNK + 4, 24);
  const sd = await createUpload(ava, d, {
    fingerprint: "d",
    fileName: "d.mp4",
  });
  await sendRange(ava, sd.id, d, 0, CHUNK);
  await api.post(`/__test__/media/uploads/${sd.id}/age`, { data: { days: 1 } });
  expect(
    (await (await api.post("/__test__/media/uploads/cleanup")).json()).failed,
  ).toBe(0);
});
