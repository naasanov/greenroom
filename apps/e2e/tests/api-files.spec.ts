import {
  GIG_IDS,
  SONGS,
  USERS,
  driveFileSongLinks,
  gigs,
  mediaItems,
  songs,
} from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  BAND,
  DRIVE,
  FakeDrive,
  clientFor,
  linkDrive,
  setupDrive,
  type Fx,
} from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const FILES = `/bands/${BAND}/files`;
const folderUrl = (id?: string) => `${FILES}/folder${id ? `/${id}` : ""}`;
const trashUrl = `${FILES}/items/trash`;
const itemUrl = (id: string) => `${FILES}/items/${id}`;
const media = (gig: string) => `/bands/${BAND}/gigs/${gig}/media`;
const codeOf = async (res: { json(): Promise<{ code?: string }> }) =>
  (await res.json()).code;

interface Entry {
  id: string;
  name: string;
  kind: string;
  gig: { id: string; title: string; date: string } | null;
  songLinks: { songId: string; title: string }[];
  isGigsRoot: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  thumbnailAvailable: boolean;
}

async function listing(api: APIRequestContext, id?: string) {
  const res = await api.get(folderUrl(id));
  expect(res.status()).toBe(200);
  return res.json() as Promise<{
    folder: { id: string; name: string; isRoot: boolean; isGigsRoot: boolean };
    breadcrumbs: { id: string; name: string; isGigsRoot?: boolean }[];
    items: Entry[];
    truncated: boolean;
  }>;
}

async function entry(api: APIRequestContext, name: string, parent?: string) {
  const e = (await listing(api, parent)).items.find((i) => i.name === name);
  expect(e, `entry ${name}`).toBeTruthy();
  return e!;
}

test("root listing, sorting, nested browse, and breadcrumbs", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();

  // Unlinked band.
  expect((await ben.get(folderUrl())).status()).toBe(409);

  const status = await setupDrive(ava);
  const root = status.folderId as string;
  await fake.external({ action: "folder", name: "zeta", parentId: root });
  const alpha = await fake.external({
    action: "folder",
    name: "Alpha",
    parentId: root,
  });
  await fake.external({
    action: "add",
    name: "b.txt",
    parentId: root,
    content: "hello world",
    mimeType: "text/plain",
  });

  const top = await listing(ben);
  expect(top.folder).toMatchObject({
    id: root,
    isRoot: true,
    isGigsRoot: false,
  });
  expect(top.breadcrumbs).toEqual([{ id: root, name: "Band stuff" }]);
  expect(top.items.map((i) => i.name)).toEqual([
    "Alpha",
    "Gigs",
    "Profile photos",
    "zeta",
    "b.txt",
  ]);
  expect(top.truncated).toBe(false);
  const gigsEntry = top.items.find((i) => i.name === "Gigs")!;
  expect(gigsEntry.isGigsRoot).toBe(true);
  expect(gigsEntry.id).toBe(status.gigsFolderId);
  const file = top.items.find((i) => i.name === "b.txt")!;
  expect(file).toMatchObject({
    kind: "file",
    mimeType: "text/plain",
    sizeBytes: 11,
    thumbnailAvailable: true,
    gig: null,
    songLinks: [],
  });
  // "root" is an alias for the Files root.
  expect((await listing(ben, "root")).folder.id).toBe(root);

  // Nested browse.
  const inner = await fake.external({
    action: "folder",
    name: "Inner",
    parentId: alpha.id,
  });
  const innerList = await listing(ben, inner.id);
  expect(innerList.folder).toMatchObject({ name: "Inner", isRoot: false });
  expect(innerList.breadcrumbs.map((b) => b.name)).toEqual([
    "Band stuff",
    "Alpha",
    "Inner",
  ]);
  const gigsList = await listing(ben, status.gigsFolderId);
  expect(gigsList.folder.isGigsRoot).toBe(true);
  expect(gigsList.breadcrumbs.at(-1)).toEqual({
    id: status.gigsFolderId,
    name: "Gigs",
    isGigsRoot: true,
  });

  // Content and thumbnail streaming, with ranges.
  const full = await ben.get(`${itemUrl(file.id)}/content`);
  expect(full.status()).toBe(200);
  // text/plain is not inline-safe, so it is always an attachment.
  expect(full.headers()["content-disposition"]).toContain("attachment");
  expect(await full.text()).toBe("hello world");
  const part = await ben.get(`${itemUrl(file.id)}/content`, {
    headers: { Range: "bytes=0-4" },
  });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe("bytes 0-4/11");
  expect(await part.text()).toBe("hello");
  const past = await ben.get(`${itemUrl(file.id)}/content`, {
    headers: { Range: "bytes=50-" },
  });
  expect(past.status()).toBe(416);
  const pic = await fake.external({
    action: "add",
    name: "pic.png",
    parentId: root,
    content: "png",
    mimeType: "image/png",
  });
  const inline = await ben.get(`${itemUrl(pic.id)}/content`);
  expect(inline.headers()["content-disposition"]).toContain("inline");
  const dl = await ben.get(`${itemUrl(pic.id)}/content?download=1`);
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  expect((await ben.get(`${itemUrl(file.id)}/thumbnail`)).status()).toBe(200);
  expect((await ben.get(`${itemUrl(alpha.id)}/content`)).status()).toBe(404);
  expect((await ben.get(`${itemUrl(alpha.id)}/thumbnail`)).status()).toBe(404);
  // A file id is not a folder.
  expect((await ben.get(folderUrl(file.id))).status()).toBe(404);
});

test("foreign folder ids are rejected everywhere and non-members get 404", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const root = status.folderId as string;

  const foreign = await fake.external({ action: "folder", name: "Foreign" });
  const foreignFile = await fake.external({
    action: "add",
    name: "x.txt",
    parentId: foreign.id,
    content: "x",
  });
  const trashedFolder = await fake.external({
    action: "folder",
    name: "Gone",
    parentId: root,
  });
  await fake.external({ action: "trash", fileId: trashedFolder.id });

  for (const id of [foreign.id, foreignFile.id, trashedFolder.id, "nope"]) {
    expect((await ava.get(folderUrl(id))).status(), `list ${id}`).toBe(404);
    expect(
      (
        await ava.post(`${FILES}/folders`, {
          data: { parentId: id, name: "n" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await ava.patch(itemUrl(id), { data: { name: "n" } })).status(),
    ).toBe(404);
    expect((await ava.post(trashUrl, { data: { ids: [id] } })).status()).toBe(
      404,
    );
    expect((await ava.get(`${itemUrl(id)}/content`)).status()).toBe(404);
    expect((await ava.get(`${itemUrl(id)}/thumbnail`)).status()).toBe(404);
    expect(
      (
        await ava.put(`${itemUrl(id)}/songs`, {
          data: { songIds: [SONGS.skyline.id] },
        })
      ).status(),
    ).toBe(404);
  }
  // Nothing foreign was touched.
  expect((await fake.byName("Foreign"))?.trashed).toBe(false);
  expect((await fake.byName("x.txt"))?.trashed).toBe(false);

  const outsider = await clientFor(testApi, "outsider@example.com");
  expect((await outsider.get(folderUrl())).status()).toBe(404);
  expect(
    (
      await outsider.post(`${FILES}/folders`, {
        data: { parentId: "root", name: "n" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await outsider.post(trashUrl, { data: { ids: [root] } })).status(),
  ).toBe(404);
  expect(
    (
      await outsider.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.post(`${media(GIG_IDS.pastBar)}/link-folder`, {
        data: { folderId: root },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.post(`${DRIVE}/gigs-folder`, { data: { create: true } })
    ).status(),
  ).toBe(404);
});

test("members create, rename, and trash; protected folders refuse", async ({
  testApi,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const root = status.folderId as string;

  // Plain member can create at the root and nested.
  const made = await ben.post(`${FILES}/folders`, {
    data: { parentId: "root", name: "Charts" },
  });
  expect(made.status()).toBe(201);
  const charts = await made.json();
  expect(charts).toMatchObject({ name: "Charts", kind: "folder" });
  expect((await fake.byName("Charts"))?.parentId).toBe(root);
  const sub = await (
    await ben.post(`${FILES}/folders`, {
      data: { parentId: charts.id, name: "Sub" },
    })
  ).json();
  expect((await fake.byName("Sub"))?.parentId).toBe(charts.id);
  expect(
    (
      await ben.post(`${FILES}/folders`, {
        data: { parentId: "root", name: " " },
      })
    ).status(),
  ).toBe(400);

  // Rename.
  const renamed = await ben.patch(itemUrl(sub.id), { data: { name: "Sub 2" } });
  expect(renamed.status()).toBe(200);
  expect((await fake.byName("Sub 2"))?.id).toBe(sub.id);
  expect(
    (await ben.patch(itemUrl(root), { data: { name: "New" } })).status(),
  ).toBe(409);
  expect(
    await codeOf(await ben.patch(itemUrl(root), { data: { name: "New" } })),
  ).toBe("FILES_ROOT_PROTECTED");
  expect((await fake.byName("Band stuff"))?.id).toBe(root);
  // Renaming the gigs root is allowed.
  expect(
    (
      await ben.patch(itemUrl(status.gigsFolderId), {
        data: { name: "Shows" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await listing(ben)).items.some((i) => i.name === "Shows" && i.isGigsRoot),
  ).toBe(true);

  // Trash a plain folder (with contents) and a file.
  const f = await fake.external({
    action: "add",
    name: "chart.pdf",
    parentId: charts.id,
    mimeType: "application/pdf",
  });
  const t = await ben.post(trashUrl, { data: { ids: [charts.id, f.id] } });
  expect(t.status()).toBe(200);
  expect(await t.json()).toEqual({ trashed: 2 });
  expect((await fake.byName("Charts"))?.trashed).toBe(true);
  expect((await listing(ben)).items.some((i) => i.name === "Charts")).toBe(
    false,
  );
  expect((await ben.get(folderUrl(charts.id))).status()).toBe(404);

  // Protected: Files root, gigs root, gig folder.
  for (const id of [root, status.gigsFolderId]) {
    const res = await ben.post(trashUrl, { data: { ids: [id] } });
    expect(res.status()).toBe(409);
    expect(await codeOf(res)).toBe("FILES_GIG_FOLDER_PROTECTED");
  }
  const created = await ben.post(`${media(GIG_IDS.upcomingClub)}/folders`, {
    data: { name: "Stage" },
  });
  expect(created.status()).toBe(201);
  const gig = seed.gigs.upcomingClub;
  const gigName = `${gig.date.slice(2)} ${gig.title}`;
  const gigsList = await listing(ben, status.gigsFolderId);
  const gigEntry = gigsList.items.find((i) => i.name === gigName)!;
  expect(gigEntry.gig).toEqual({
    id: gig.id,
    title: gig.title,
    date: gig.date,
  });
  const plainFile = await fake.external({
    action: "add",
    name: "keep.txt",
    parentId: root,
  });
  const ok = await ben.post(trashUrl, {
    data: { ids: [plainFile.id, gigEntry.id] },
  });
  expect(ok.status()).toBe(409);
  expect(await codeOf(ok)).toBe("FILES_GIG_FOLDER_PROTECTED");
  expect((await fake.byName(gigName))?.trashed).toBe(false);
  // A mixed batch is all or nothing.
  expect((await fake.byName("keep.txt"))?.trashed).toBe(false);
  // Gig folders can be renamed in Drive.
  expect(
    (
      await ben.patch(itemUrl(gigEntry.id), { data: { name: "renamed gig" } })
    ).status(),
  ).toBe(200);
  expect((await listing(ben, status.gigsFolderId)).items[0]!.gig?.id).toBe(
    gig.id,
  );
});

test("song links: set, list, unavailable after trash, cascade on song delete", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const root = status.folderId as string;
  const doc = await fake.external({
    action: "add",
    name: "tab.pdf",
    parentId: root,
    mimeType: "application/pdf",
  });
  const folder = await fake.external({
    action: "folder",
    name: "Stems",
    parentId: root,
  });

  const set = await ben.put(`${itemUrl(doc.id)}/songs`, {
    data: { songIds: [SONGS.skyline.id, SONGS.paperPlanes.id] },
  });
  expect(set.status()).toBe(200);
  expect(
    (await set.json()).songLinks.map((l: { title: string }) => l.title),
  ).toEqual(["Paper Planes", "Skyline Drive"]);
  await ben.put(`${itemUrl(folder.id)}/songs`, {
    data: { songIds: [SONGS.skyline.id] },
  });
  expect((await entry(ben, "tab.pdf")).songLinks).toHaveLength(2);

  const files = await (
    await ben.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
  ).json();
  expect(files).toHaveLength(2);
  expect(
    files.find((f: { driveFileId: string }) => f.driveFileId === doc.id),
  ).toMatchObject({
    name: "tab.pdf",
    mimeType: "application/pdf",
    isFolder: false,
    available: true,
    parentId: root,
    gig: null,
  });
  expect(
    files.find((f: { driveFileId: string }) => f.driveFileId === folder.id),
  ).toMatchObject({
    isFolder: true,
    available: true,
  });

  // Replacing the set is complete, not additive; unknown and foreign songs are refused.
  await ben.put(`${itemUrl(doc.id)}/songs`, {
    data: { songIds: [SONGS.paperPlanes.id] },
  });
  expect((await entry(ben, "tab.pdf")).songLinks.map((l) => l.title)).toEqual([
    "Paper Planes",
  ]);
  expect(
    (
      await ben.put(`${itemUrl(doc.id)}/songs`, {
        data: { songIds: [SONGS.sideProjectSong.id] },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await ben.put(`${itemUrl(doc.id)}/songs`, { data: { songIds: ["x"] } })
    ).status(),
  ).toBe(400);
  await ben.put(`${itemUrl(doc.id)}/songs`, {
    data: { songIds: [SONGS.skyline.id, SONGS.paperPlanes.id] },
  });

  // Rename in Drive is reflected; trash, delete, and moving out mark it unavailable.
  await fake.external({ action: "rename", fileId: doc.id, name: "tab v2.pdf" });
  const renamed = await (
    await ben.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
  ).json();
  expect(
    renamed.find((f: { driveFileId: string }) => f.driveFileId === doc.id).name,
  ).toBe("tab v2.pdf");

  await ben.post(trashUrl, { data: { ids: [doc.id] } });
  const afterTrash = await (
    await ben.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
  ).json();
  expect(
    afterTrash.find((f: { driveFileId: string }) => f.driveFileId === doc.id),
  ).toMatchObject({ available: false, name: "tab v2.pdf" });
  await fake.external({ action: "delete", fileId: folder.id });
  const afterDelete = await (
    await ben.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
  ).json();
  expect(afterDelete.map((f: { available: boolean }) => f.available)).toEqual([
    false,
    false,
  ]);
  const moved = await fake.external({
    action: "add",
    name: "m.txt",
    parentId: status.folderId,
  });
  await ben.put(`${itemUrl(moved.id)}/songs`, {
    data: { songIds: [SONGS.skyline.id] },
  });
  const foreign = await fake.external({ action: "folder", name: "Elsewhere" });
  await fake.external({
    action: "move",
    fileId: moved.id,
    parentId: foreign.id,
  });
  const out = await (
    await ben.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/files`)
  ).json();
  expect(
    out.find((f: { driveFileId: string }) => f.driveFileId === moved.id)
      .available,
  ).toBe(false);
  // Links are never deleted by availability checks.
  const rows = await db
    .select()
    .from(driveFileSongLinks)
    .where(eq(driveFileSongLinks.songId, SONGS.skyline.id));
  expect(rows).toHaveLength(3);

  expect(
    (
      await ben.get(`/bands/${BAND}/songs/${SONGS.sideProjectSong.id}/files`)
    ).status(),
  ).toBe(404);

  // Deleting the song cascades its links.
  await db.delete(songs).where(eq(songs.id, SONGS.skyline.id));
  expect(
    await db
      .select()
      .from(driveFileSongLinks)
      .where(eq(driveFileSongLinks.songId, SONGS.skyline.id)),
  ).toHaveLength(0);
});

test("gigs root change validates and leaves existing gig folders alone", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();

  expect(
    (
      await ben.post(`${DRIVE}/gigs-folder`, { data: { create: true } })
    ).status(),
  ).toBe(409);

  const status = await setupDrive(ava);
  const root = status.folderId as string;
  const oldGigs = status.gigsFolderId as string;
  await ben.post(`${media(GIG_IDS.upcomingClub)}/folders`, {
    data: { name: "S" },
  });
  const [gigBefore] = await db
    .select({ f: gigs.driveFolderId })
    .from(gigs)
    .where(eq(gigs.id, GIG_IDS.upcomingClub));

  const post = (data: unknown) => ben.post(`${DRIVE}/gigs-folder`, { data });
  const reject = async (data: unknown, status_: number, code?: string) => {
    const res = await post(data);
    expect(res.status()).toBe(status_);
    if (code) expect(await codeOf(res)).toBe(code);
  };
  await reject({}, 400);
  await reject({ folderId: root }, 422, "FILES_OUTSIDE_ROOT");
  const foreign = await fake.external({ action: "folder", name: "Foreign" });
  await reject({ folderId: foreign.id }, 422, "FILES_OUTSIDE_ROOT");
  await reject({ folderId: "nope" }, 422, "FILES_OUTSIDE_ROOT");
  const aFile = await fake.external({
    action: "add",
    name: "f.txt",
    parentId: root,
  });
  await reject({ folderId: aFile.id }, 422, "DRIVE_NOT_A_FOLDER");
  const trashed = await fake.external({
    action: "folder",
    name: "T",
    parentId: root,
  });
  await fake.external({ action: "trash", fileId: trashed.id });
  await reject({ folderId: trashed.id }, 422, "FILES_OUTSIDE_ROOT");
  expect(
    (await ben.get(`${DRIVE}/status`).then((r) => r.json())).gigsFolderId,
  ).toBe(oldGigs);

  // Pick an existing nested folder.
  const nested = await fake.external({
    action: "folder",
    name: "Shows",
    parentId: root,
  });
  const picked = await post({ folderId: nested.id });
  expect(picked.status()).toBe(200);
  expect((await picked.json()).gigsFolderId).toBe(nested.id);
  const [gigAfter] = await db
    .select({ f: gigs.driveFolderId })
    .from(gigs)
    .where(eq(gigs.id, GIG_IDS.upcomingClub));
  expect(gigAfter!.f).toBe(gigBefore!.f);
  expect(
    (await fake.files()).find((f) => f.id === gigBefore!.f)?.parentId,
  ).toBe(oldGigs);

  // New gig folders land under the new gigs root.
  await ben.post(`${media(GIG_IDS.pastBar)}/folders`, { data: { name: "S" } });
  const [pastBar] = await db
    .select({ f: gigs.driveFolderId })
    .from(gigs)
    .where(eq(gigs.id, GIG_IDS.pastBar));
  expect((await fake.files()).find((f) => f.id === pastBar!.f)?.parentId).toBe(
    nested.id,
  );

  // Create a fresh folder, default and custom name.
  const created = await (await post({ create: true })).json();
  const createdFolder = (await fake.files()).find(
    (f) => f.id === created.gigsFolderId,
  )!;
  expect(createdFolder).toMatchObject({ name: "Gigs", parentId: root });
  const custom = await (
    await post({ create: true, name: "Shows 2027" })
  ).json();
  expect(
    (await fake.files()).find((f) => f.id === custom.gigsFolderId)?.name,
  ).toBe("Shows 2027");
});

test("setRootFolder accepts a gigsFolderId in one call", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await linkDrive(ava);
  const picker = await (await ava.get(`${DRIVE}/fake-picker`)).json();
  const stuff = picker.folders.find(
    (f: { name: string }) => f.name === "Band stuff",
  );
  const other = picker.folders.find(
    (f: { name: string }) => f.name === "Greenroom demo",
  );
  const shows = await fake.external({
    action: "folder",
    name: "Shows",
    parentId: stuff.id,
  });
  const outside = await fake.external({
    action: "folder",
    name: "Out",
    parentId: other.id,
  });

  for (const bad of [stuff.id, outside.id, "nope"]) {
    const res = await ava.post(`${DRIVE}/folder`, {
      data: { folderId: stuff.id, gigsFolderId: bad },
    });
    expect(res.status(), bad).toBe(422);
  }
  expect(
    (await ava.get(`${DRIVE}/status`).then((r) => r.json())).folderSet,
  ).toBe(false);

  const res = await ava.post(`${DRIVE}/folder`, {
    data: { folderId: stuff.id, gigsFolderId: shows.id },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ folderSet: true, gigsFolderId: shows.id });
  const files = await fake.files();
  expect(files.filter((f: Fx) => f.name === "Gigs")).toHaveLength(0);
  expect(files.find((f: Fx) => f.name === "Profile photos")?.parentId).toBe(
    stuff.id,
  );
});

test("link an existing folder to a gig: backfill, idempotence, and 409s", async ({
  testApi,
  db,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();
  const link = (gig: string, folderId: string, api = ben) =>
    api.post(`${media(gig)}/link-folder`, { data: { folderId } });

  const GIG = GIG_IDS.upcomingClub;
  expect((await link(GIG, "x")).status()).toBe(409);

  const status = await setupDrive(ava);
  const root = status.folderId as string;
  const old = await fake.external({
    action: "folder",
    name: "Old show",
    parentId: root,
  });
  await fake.external({
    action: "add",
    name: "a.jpg",
    parentId: old.id,
    mimeType: "image/jpeg",
    content: "aaa",
  });
  await fake.external({
    action: "add",
    name: "b.txt",
    parentId: old.id,
    mimeType: "text/plain",
  });
  const crowd = await fake.external({
    action: "folder",
    name: "Crowd",
    parentId: old.id,
  });
  await fake.external({
    action: "add",
    name: "c.jpg",
    parentId: crowd.id,
    mimeType: "image/jpeg",
  });
  await fake.external({ action: "folder", name: "Deeper", parentId: crowd.id });

  // Rejections leave everything unchanged.
  const foreign = await fake.external({ action: "folder", name: "Foreign" });
  const aFile = await fake.external({
    action: "add",
    name: "f.txt",
    parentId: root,
  });
  for (const [id, code] of [
    [foreign.id, "FILES_OUTSIDE_ROOT"],
    ["nope", "FILES_OUTSIDE_ROOT"],
    [root, "FILES_OUTSIDE_ROOT"],
    [status.gigsFolderId, "FILES_OUTSIDE_ROOT"],
    [aFile.id, "DRIVE_NOT_A_FOLDER"],
  ] as const) {
    const res = await link(GIG, id);
    expect(res.status(), id).toBe(422);
    expect(await codeOf(res)).toBe(code);
  }
  expect(
    (
      await link(GIG, old.id, await clientFor(testApi, "outsider@example.com"))
    ).status(),
  ).toBe(404);
  expect(
    (
      await ben.post(
        `${media("00000000-0000-4000-8000-000000000000")}/link-folder`,
        {
          data: { folderId: old.id },
        },
      )
    ).status(),
  ).toBe(404);
  expect(
    (await ben.post(`${media(GIG)}/link-folder`, { data: {} })).status(),
  ).toBe(400);

  // A plain member links it; backfill mirrors what the poller creates.
  const res = await link(GIG, old.id);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.driveLinked).toBe(true);
  expect(body.driveFolderUrl).toContain(old.id);
  expect(body.unsorted.map((i: { name: string }) => i.name).sort()).toEqual([
    "a.jpg",
    "b.txt",
  ]);
  expect(body.folders).toHaveLength(1);
  expect(body.folders[0]).toMatchObject({ name: "Crowd", position: 0 });
  expect(body.folders[0].items.map((i: { name: string }) => i.name)).toEqual([
    "c.jpg",
  ]);
  expect(body.counts).toEqual({ photos: 2, videos: 0, other: 1 });
  const [gigRow] = await db.select().from(gigs).where(eq(gigs.id, GIG));
  expect(gigRow!.driveFolderId).toBe(old.id);
  const items = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.gigId, GIG));
  expect(items).toHaveLength(3);
  expect(items.every((i) => i.uploadedByUserId === null && !i.missing)).toBe(
    true,
  );
  expect(items.find((i) => i.name === "a.jpg")).toMatchObject({
    mimeType: "image/jpeg",
    sizeBytes: 3,
    folderId: null,
  });
  expect(items.find((i) => i.name === "c.jpg")!.folderId).not.toBeNull();
  // Images are served through the media routes.
  const a = body.unsorted.find((i: { name: string }) => i.name === "a.jpg");
  expect((await ben.get(`/bands/${BAND}/media/${a.id}/content`)).status()).toBe(
    200,
  );

  // Files listing now badges the folder with the gig.
  const badge = await entry(ben, "Old show");
  expect(badge.gig).toEqual({
    id: GIG,
    title: seed.gigs.upcomingClub.title,
    date: seed.gigs.upcomingClub.date,
  });
  expect(badge.kind).toBe("folder");

  // The poller sees later Drive additions as the gig's media and leaves the backfill alone.
  await fake.external({
    action: "add",
    name: "late.jpg",
    parentId: old.id,
    mimeType: "image/jpeg",
  });
  await fake.poll();
  const afterPoll = await (await ben.get(media(GIG))).json();
  expect(
    afterPoll.unsorted.map((i: { name: string }) => i.name).sort(),
  ).toEqual(["a.jpg", "b.txt", "late.jpg"]);
  expect(
    await db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.gigId, GIG), eq(mediaItems.name, "a.jpg"))),
  ).toHaveLength(1);

  // 409s: the gig already has a folder; the folder belongs to another gig.
  const again = await link(GIG, old.id);
  expect(again.status()).toBe(409);
  expect(await codeOf(again)).toBe("GIG_ALREADY_HAS_FOLDER");
  const other = await link(GIG_IDS.pastBar, old.id);
  expect(other.status()).toBe(409);
  expect(await codeOf(other)).toBe("FILES_FOLDER_ALREADY_LINKED");
  const [pb] = await db.select().from(gigs).where(eq(gigs.id, GIG_IDS.pastBar));
  expect(pb!.driveFolderId).toBeNull();

  // A gig folder nested inside a plain folder blocks trashing that plain folder.
  const plain = await fake.external({
    action: "folder",
    name: "Plain",
    parentId: root,
  });
  const inner = await fake.external({
    action: "folder",
    name: "Inner show",
    parentId: plain.id,
  });
  expect((await link(GIG_IDS.pastBar, inner.id)).status()).toBe(200);
  const t = await ben.post(trashUrl, { data: { ids: [plain.id] } });
  expect(t.status()).toBe(409);
  expect(await codeOf(t)).toBe("FILES_GIG_FOLDER_PROTECTED");
  expect((await fake.byName("Plain"))?.trashed).toBe(false);
  // The gig folder is then found at its new place.
  expect((await entry(ben, "Inner show", plain.id)).gig?.id).toBe(
    GIG_IDS.pastBar,
  );
});
