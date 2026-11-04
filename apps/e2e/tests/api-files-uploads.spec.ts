import { USERS, mediaItems, uploadSessions } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
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
import { CHUNK, GIG, bytes, sessionUrl } from "./api-uploads-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const FILES_UPLOADS = `/bands/${BAND}/files/uploads`;

interface FSess {
  id: string;
  gigId: string | null;
  status: string;
  bytesReceived: number;
  totalBytes: number;
  fileName: string;
  folderId: string | null;
  item: unknown;
  file?: {
    id: string;
    name: string;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
}

function body(data: Buffer, over: Record<string, unknown> = {}) {
  return {
    fileName: "notes.txt",
    mimeType: "text/plain",
    totalBytes: data.length,
    fingerprint: `notes.txt:${data.length}:1`,
    folderId: "root",
    ...over,
  };
}

async function create(
  api: APIRequestContext,
  data: Buffer,
  over: Record<string, unknown> = {},
): Promise<FSess> {
  const res = await api.post(FILES_UPLOADS, { data: body(data, over) });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

async function put(
  api: APIRequestContext,
  id: string,
  data: Buffer,
  start: number,
  end: number,
) {
  return api.put(sessionUrl(id), {
    data: data.subarray(start, end),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes ${start}-${end - 1}/${data.length}`,
    },
  });
}

async function send(
  api: APIRequestContext,
  id: string,
  data: Buffer,
  from: number,
  to = data.length,
): Promise<FSess> {
  let last: FSess | undefined;
  for (let s = from; s < to; s += CHUNK) {
    const res = await put(api, id, data, s, Math.min(s + CHUNK, to));
    expect(res.status(), await res.text()).toBe(200);
    last = await res.json();
  }
  return last!;
}

async function setup(testApi: TestApi) {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const root = status.folderId as string;
  return { ava, fake, root };
}

test("multi-chunk upload into root and a nested folder, any mime type", async ({
  testApi,
  db,
}) => {
  const { ava, fake, root } = await setup(testApi);
  const data = bytes(CHUNK * 2 + 99, 5);
  const s = await create(ava, data, {
    fileName: "mix.zip",
    mimeType: "application/zip",
    fingerprint: "zip",
  });
  expect(s).toMatchObject({
    gigId: null,
    status: "pending",
    bytesReceived: 0,
    totalBytes: data.length,
    item: null,
  });
  const mid = await (await put(ava, s.id, data, 0, CHUNK)).json();
  expect(mid).toMatchObject({ status: "uploading", bytesReceived: CHUNK });
  const done = await send(ava, s.id, data, CHUNK);
  expect(done).toMatchObject({ status: "complete", item: null });
  expect(done.file).toMatchObject({
    name: "mix.zip",
    mimeType: "application/zip",
    sizeBytes: data.length,
  });
  const inRoot = (await fake.byName("mix.zip"))!;
  expect(inRoot.id).toBe(done.file!.id);
  expect(inRoot.parentId).toBe(root);
  expect(await fake.content(inRoot.id)).toEqual(data);

  const album = await fake.external({
    action: "folder",
    name: "Album",
    parentId: root,
  });
  const deep = await fake.external({
    action: "folder",
    name: "Demos",
    parentId: album.id,
  });
  const d2 = bytes(CHUNK + 7, 6);
  const s2 = await create(ava, d2, {
    fileName: "take1.bin",
    mimeType: "application/x-weird",
    fingerprint: "take1",
    folderId: deep.id,
  });
  const done2 = await send(ava, s2.id, d2, 0);
  expect(done2.status).toBe("complete");
  const f2 = (await fake.byName("take1.bin"))!;
  expect(f2.parentId).toBe(deep.id);
  expect(await fake.content(f2.id)).toEqual(d2);

  // PATCH rename works; folderId and songId are gig-media concepts.
  const renamed = await ava.patch(sessionUrl(s2.id), {
    data: { fileName: "take-one.bin" },
  });
  expect(renamed.status()).toBe(200);
  expect((await renamed.json()).file.name).toBe("take-one.bin");
  expect((await fake.byName("take-one.bin"))!.id).toBe(f2.id);
  const moved = await ava.patch(sessionUrl(s2.id), {
    data: { folderId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(moved.status()).toBe(422);
  expect((await moved.json()).code).toBe("FILES_USE_GIG_MEDIA");

  // No media rows were created.
  expect(await db.select().from(mediaItems)).toHaveLength(0);
});

test("gig folders and anything under them are 422, outside the root is 404", async ({
  testApi,
}) => {
  const { ava, fake, root } = await setup(testApi);
  const data = bytes(1000);
  const sub = await ava.post(`/bands/${BAND}/gigs/${GIG}/media/folders`, {
    data: { name: "Stage" },
  });
  expect(sub.status()).toBe(201);
  const files = await fake.files();
  const gigFolder = files.find((f) => /^\d\d-\d\d-\d\d /.test(f.name))!;
  const stage = files.find((f) => f.name === "Stage")!;

  for (const folderId of [gigFolder.id, stage.id]) {
    const res = await ava.post(FILES_UPLOADS, {
      data: body(data, { folderId, fingerprint: folderId }),
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("FILES_USE_GIG_MEDIA");
  }

  const outside = await fake.external({
    action: "folder",
    name: "Elsewhere",
    parentId: "root",
  });
  for (const folderId of [outside.id, "nope-not-an-id"]) {
    const res = await ava.post(FILES_UPLOADS, {
      data: body(data, { folderId, fingerprint: folderId }),
    });
    expect(res.status()).toBe(404);
  }
  // A file id is not a folder.
  const file = await fake.external({
    action: "add",
    name: "x.txt",
    parentId: root,
    content: "x",
    mimeType: "text/plain",
  });
  const asFolder = await ava.post(FILES_UPLOADS, {
    data: body(data, { folderId: file.id }),
  });
  expect(asFolder.status()).toBe(404);

  const huge = await ava.post(FILES_UPLOADS, {
    data: body(data, { totalBytes: 11 * 1024 ** 3 }),
  });
  expect(huge.status()).toBe(422);
  expect((await huge.json()).code).toBe("UPLOAD_TOO_LARGE");
});

test("resume by fingerprint, skip when complete, cancel, interrupt", async ({
  testApi,
}) => {
  const { ava, fake, root } = await setup(testApi);
  const api = await anon();
  const folder = await fake.external({
    action: "folder",
    name: "Stems",
    parentId: root,
  });
  const data = bytes(CHUNK * 4, 8);
  const over = {
    fingerprint: "stems",
    fileName: "kick.wav",
    folderId: folder.id,
  };
  const s = await create(ava, data, over);
  await send(ava, s.id, data, 0, CHUNK);

  const half = CHUNK / 2;
  await api.post(`/__test__/media/uploads/${s.id}/interrupt`, {
    data: { acceptBytes: half },
  });
  const failed = await put(ava, s.id, data, CHUNK, CHUNK * 2);
  expect(failed.status()).toBe(502);
  expect(await failed.json()).toMatchObject({
    code: "UPLOAD_DRIVE_ERROR",
    bytesReceived: CHUNK + half,
  });

  const resumed = await create(ava, data, over);
  expect(resumed).toMatchObject({
    id: s.id,
    status: "uploading",
    bytesReceived: CHUNK + half,
  });
  // Same fingerprint in another folder is a different upload.
  const elsewhere = await create(
    ava,
    data,
    over && { ...over, folderId: "root" },
  );
  expect(elsewhere.id).not.toBe(s.id);

  const done = await send(ava, s.id, data, resumed.bytesReceived);
  expect(done.status).toBe("complete");
  const file = (await fake.files()).find(
    (f) => f.name === "kick.wav" && f.parentId === folder.id,
  )!;
  expect(await fake.content(file.id)).toEqual(data);

  const skipped = await create(ava, data, over);
  expect(skipped).toMatchObject({ id: s.id, status: "complete" });
  expect(skipped.file!.id).toBe(file.id);
  expect(
    (await fake.files()).filter((f) => f.name === "kick.wav" && !f.trashed),
  ).toHaveLength(1);

  // A cancelled session blocks chunks and the next create starts fresh.
  const c = await create(ava, data, { fingerprint: "c", fileName: "c.wav" });
  const cancelled = await ava.delete(sessionUrl(c.id));
  expect((await cancelled.json()).status).toBe("cancelled");
  const blocked = await put(ava, c.id, data, 0, CHUNK);
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toMatchObject({ code: "UPLOAD_NOT_ACTIVE" });
  const again = await create(ava, data, {
    fingerprint: "c",
    fileName: "c.wav",
  });
  expect(again.id).not.toBe(c.id);
});

test("list mine, gig list ignores files sessions, membership checks", async ({
  testApi,
  db,
}) => {
  const { ava } = await setup(testApi);
  const ben = await clientFor(testApi, USERS.ben.email);
  const a = bytes(CHUNK + 1, 31);
  const b = bytes(CHUNK + 2, 32);
  const sa = await create(ava, a, { fingerprint: "a", fileName: "a.txt" });
  await send(ava, sa.id, a, 0);
  const sb = await create(ava, b, { fingerprint: "b", fileName: "b.txt" });
  await send(ava, sb.id, b, 0, CHUNK);
  const sc = await create(ava, a, { fingerprint: "c", fileName: "c.txt" });
  await ava.delete(sessionUrl(sc.id));
  await create(ben, a, { fingerprint: "a", fileName: "ben.txt" });

  const list = (await (
    await ava.get(FILES_UPLOADS + "?mine=1")
  ).json()) as FSess[];
  expect(list.map((s) => s.fileName)).toEqual(["b.txt", "a.txt"]);
  expect(list[1]!.file).toMatchObject({ name: "a.txt" });
  expect(list[0]).toMatchObject({ status: "uploading", file: null });

  const gigList = await (
    await ava.get(`/bands/${BAND}/gigs/${GIG}/uploads?mine=1`)
  ).json();
  expect(gigList).toEqual([]);

  expect(await db.select().from(mediaItems)).toHaveLength(0);
  const rows = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, sa.id));
  expect(rows[0]).toMatchObject({ gigId: null, status: "complete" });

  const outsider = await clientFor(testApi, "outsider@example.com");
  expect((await outsider.post(FILES_UPLOADS, { data: body(a) })).status()).toBe(
    404,
  );
  expect((await outsider.get(FILES_UPLOADS + "?mine=1")).status()).toBe(404);
  // Another member cannot touch Ava's session.
  expect((await ben.get(sessionUrl(sa.id))).status()).toBe(404);
  expect((await ben.delete(sessionUrl(sb.id))).status()).toBe(404);
});

test("unlinked Drive is 409", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const res = await ava.post(FILES_UPLOADS, { data: body(bytes(10)) });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("GOOGLE_NOT_LINKED");
});
