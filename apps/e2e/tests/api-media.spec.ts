import { GIG_IDS, SONGS, USERS, mediaItems } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const GIG = GIG_IDS.upcomingClub;
const media = (gig = GIG) => `/bands/${BAND}/gigs/${gig}/media`;

test("media read when Drive is not linked", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const res = await ava.get(media());
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    driveLinked: false,
    driveFolderUrl: null,
    folders: [],
    unsorted: [],
    counts: { photos: 0, videos: 0, other: 0 },
  });
  expect(
    (await ava.post(`${media()}/folders`, { data: { name: "x" } })).status(),
  ).toBe(409);
  const outsider = await clientFor(testApi, "outsider@example.com");
  expect((await outsider.get(media())).status()).toBe(404);
  expect(
    (await ava.get(media("00000000-0000-4000-8000-000000000000"))).status(),
  ).toBe(404);
});

test("lazy gig folder, folder CRUD, and item operations hit the fake Drive", async ({
  testApi,
  db,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);

  const before = await (await ben.get(media())).json();
  expect(before).toMatchObject({
    driveLinked: true,
    driveFolderUrl: null,
    folders: [],
    unsorted: [],
  });
  // No gig folder until media is touched.
  expect(
    (await fake.files()).filter((f) => f.parentId && f.name.startsWith("20")),
  ).toHaveLength(0);

  const gig = seed.gigs.upcomingClub;
  const stage = await (
    await ben.post(`${media()}/folders`, { data: { name: "Stage" } })
  ).json();
  expect(stage).toMatchObject({ name: "Stage", position: 0 });
  const gigFolder = await fake.byName(`${gig.date} ${gig.title}`);
  expect(gigFolder).toBeTruthy();
  const gigsRoot = await fake.byName("Gigs");
  expect(gigFolder!.parentId).toBe(gigsRoot!.id);
  const stageDrive = await fake.byName("Stage");
  expect(stageDrive!.parentId).toBe(gigFolder!.id);

  const crowd = await (
    await ava.post(`${media()}/folders`, { data: { name: "Crowd" } })
  ).json();
  expect(crowd.position).toBe(1);
  expect(
    (await fake.files()).filter((f) => f.name === `${gig.date} ${gig.title}`),
  ).toHaveLength(1);
  expect(
    (await ava.post(`${media()}/folders`, { data: { name: "  " } })).status(),
  ).toBe(400);

  const reordered = await (
    await ava.put(`${media()}/folders/order`, {
      data: { ids: [crowd.id, stage.id] },
    })
  ).json();
  expect(reordered.map((f: { name: string }) => f.name)).toEqual([
    "Crowd",
    "Stage",
  ]);
  expect(
    (
      await ava.put(`${media()}/folders/order`, {
        data: { ids: [crowd.id, GIG] },
      })
    ).status(),
  ).toBe(422);

  expect(
    (
      await ava.patch(`/bands/${BAND}/media/folders/${stage.id}`, {
        data: { name: "Stage view" },
      })
    ).status(),
  ).toBe(200);
  expect((await fake.byName("Stage view"))!.id).toBe(stageDrive!.id);

  // Seed files in Drive and ingest them via the poller.
  const a = await fake.external({
    action: "add",
    name: "a.png",
    parentId: gigFolder!.id,
    mimeType: "image/png",
    content: "aaa",
  });
  await fake.external({
    action: "add",
    name: "b.mp4",
    parentId: gigFolder!.id,
    mimeType: "video/mp4",
    content: "bbb",
  });
  await fake.external({
    action: "add",
    name: "c.pdf",
    parentId: gigFolder!.id,
    mimeType: "application/pdf",
    content: "ccc",
  });
  await fake.poll();
  const read = await (await ava.get(media())).json();
  expect(read.driveFolderUrl).toContain(gigFolder!.id);
  expect(read.unsorted.map((i: { name: string }) => i.name)).toEqual([
    "a.png",
    "b.mp4",
    "c.pdf",
  ]);
  expect(read.counts).toEqual({ photos: 1, videos: 1, other: 1 });
  const item = read.unsorted[0];
  expect(item).toMatchObject({
    mimeType: "image/png",
    missing: false,
    songId: null,
  });
  expect(item.thumbnailUrl).toMatch(/\/media\/.+\/thumbnail$/);
  expect(item.contentUrl).toMatch(/\/media\/.+\/content$/);

  // Rename, move into a folder, back to Unsorted.
  const renamed = await (
    await ben.patch(`/bands/${BAND}/media/${item.id}`, {
      data: { name: "opening.png" },
    })
  ).json();
  expect(renamed.name).toBe("opening.png");
  expect((await fake.files()).find((f) => f.id === a.id)!.name).toBe(
    "opening.png",
  );

  const moved = await ben.post(`/bands/${BAND}/media/move`, {
    data: { itemIds: [item.id], folderId: stage.id },
  });
  expect(moved.status()).toBe(200);
  expect((await fake.files()).find((f) => f.id === a.id)!.parentId).toBe(
    stageDrive!.id,
  );
  const afterMove = await (await ava.get(media())).json();
  expect(
    afterMove.folders.find((f: { id: string }) => f.id === stage.id).items,
  ).toHaveLength(1);
  expect(afterMove.unsorted).toHaveLength(2);

  // Non-empty folder cannot be deleted.
  const blocked = await ava.delete(`/bands/${BAND}/media/folders/${stage.id}`);
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("MEDIA_FOLDER_NOT_EMPTY");

  await ava.post(`/bands/${BAND}/media/move`, {
    data: { itemIds: [item.id], folderId: null },
  });
  expect((await fake.files()).find((f) => f.id === a.id)!.parentId).toBe(
    gigFolder!.id,
  );

  // Trash is recoverable: Drive trash flag, trashed_at set, hidden from reads.
  const trash = await ava.post(`/bands/${BAND}/media/trash`, {
    data: { itemIds: [item.id] },
  });
  expect(await trash.json()).toEqual({ trashed: 1 });
  expect((await fake.files()).find((f) => f.id === a.id)!.trashed).toBe(true);
  const [row] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, item.id));
  expect(row!.trashedAt).not.toBeNull();
  expect((await (await ava.get(media())).json()).unsorted).toHaveLength(2);

  // Empty folder deletes and trashes the Drive folder.
  expect(
    (await ava.delete(`/bands/${BAND}/media/folders/${stage.id}`)).status(),
  ).toBe(204);
  expect(
    (await fake.files()).find((f) => f.id === stageDrive!.id)!.trashed,
  ).toBe(true);
  expect(
    (await (await ava.get(media())).json()).folders.map(
      (f: { name: string }) => f.name,
    ),
  ).toEqual(["Crowd"]);

  // Items from another gig cannot be moved together.
  expect(
    (
      await ava.post(`/bands/${BAND}/media/move`, {
        data: {
          itemIds: ["00000000-0000-4000-8000-000000000000"],
          folderId: null,
        },
      })
    ).status(),
  ).toBe(404);
});

test("thumbnail and content streaming, and missing-file marking", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const outsider = await clientFor(testApi, "outsider@example.com");
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  await ava.post(`${media()}/folders`, { data: { name: "F" } });
  const gigFolder = (await fake.files()).find((f) =>
    /^\d{4}-\d\d-\d\d /.test(f.name),
  )!;
  await fake.external({
    action: "add",
    name: "pic.png",
    parentId: gigFolder.id,
    mimeType: "image/png",
    content: "PNGDATA",
  });
  const doc = await fake.external({
    action: "add",
    name: "page.html",
    parentId: gigFolder.id,
    mimeType: "text/html",
    content: "<b>x</b>",
  });
  await fake.poll();
  const { unsorted } = await (await ava.get(media())).json();
  const pic = unsorted.find((i: { name: string }) => i.name === "pic.png");

  const thumb = await ava.get(`/bands/${BAND}/media/${pic.id}/thumbnail`);
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["cache-control"]).toContain("private");
  expect(thumb.headers()["content-type"]).toContain("image/");

  const inline = await ava.get(`/bands/${BAND}/media/${pic.id}/content`);
  expect(inline.status()).toBe(200);
  expect(await inline.text()).toBe("PNGDATA");
  expect(inline.headers()["content-type"]).toBe("image/png");
  expect(inline.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(inline.headers()["cache-control"]).toContain("private");
  const dl = await ava.get(`/bands/${BAND}/media/${pic.id}/content?download=1`);
  expect(dl.headers()["content-disposition"]).toMatch(
    /^attachment; filename="pic.png"/,
  );

  // Unsafe types never render inline.
  const html = unsorted.find((i: { name: string }) => i.name === "page.html");
  const htmlRes = await ava.get(`/bands/${BAND}/media/${html.id}/content`);
  expect(htmlRes.headers()["content-disposition"]).toMatch(/^attachment;/);

  expect(
    (await outsider.get(`/bands/${BAND}/media/${pic.id}/content`)).status(),
  ).toBe(404);

  // Deleted in Drive: thumbnail 404 marks the item missing, shown as a placeholder.
  await fake.external({ action: "delete", fileId: doc.id });
  const gone = await ava.get(`/bands/${BAND}/media/${html.id}/thumbnail`);
  expect(gone.status()).toBe(404);
  const [row] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, html.id));
  expect(row!.missing).toBe(true);
  const after = await (await ava.get(media())).json();
  const placeholder = after.unsorted.find(
    (i: { id: string }) => i.id === html.id,
  );
  expect(placeholder).toMatchObject({ missing: true, thumbnailUrl: null });
  expect(
    (await ava.get(`/bands/${BAND}/media/${html.id}/content`)).status(),
  ).toBe(404);
});

test("song links rename uncustomized items and list by gig", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  await ava.post(`${media()}/folders`, { data: { name: "F" } });
  const gigFolder = (await fake.files()).find((f) =>
    /^\d{4}-\d\d-\d\d /.test(f.name),
  )!;
  for (const n of ["IMG_1.mov", "IMG_2.mov", "IMG_3.mov"])
    await fake.external({
      action: "add",
      name: n,
      parentId: gigFolder.id,
      mimeType: "video/quicktime",
      content: n,
    });
  await fake.poll();
  const { unsorted } = await (await ava.get(media())).json();
  const [one, two, three] = unsorted;

  // A custom name is kept; uncustomized items take the song title plus extension.
  await ava.patch(`/bands/${BAND}/media/${three.id}`, {
    data: { name: "my take.mov" },
  });
  const linked = await ava.put(`/bands/${BAND}/media/items/song`, {
    data: { itemIds: [one.id, two.id, three.id], songId: SONGS.skyline.id },
  });
  expect(linked.status()).toBe(200);
  const items = await linked.json();
  expect(items.map((i: { name: string }) => i.name)).toEqual([
    "Skyline Drive.mov",
    "Skyline Drive (2).mov",
    "my take.mov",
  ]);
  expect(
    items.every((i: { songId: string }) => i.songId === SONGS.skyline.id),
  ).toBe(true);
  expect(
    (await fake.files()).find((f) => f.name === "Skyline Drive (2).mov"),
  ).toBeTruthy();

  const groups = await (
    await ava.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/media`)
  ).json();
  expect(groups).toHaveLength(1);
  expect(groups[0].gig.id).toBe(GIG);
  expect(groups[0].items).toHaveLength(3);

  // Unlink; trashed items drop out of the song list.
  await ava.put(`/bands/${BAND}/media/items/song`, {
    data: { itemIds: [one.id], songId: null },
  });
  await ava.post(`/bands/${BAND}/media/trash`, { data: { itemIds: [two.id] } });
  const left = await (
    await ava.get(`/bands/${BAND}/songs/${SONGS.skyline.id}/media`)
  ).json();
  expect(left[0].items).toHaveLength(1);
  const bad = await ava.put(`/bands/${BAND}/media/items/song`, {
    data: { itemIds: [one.id], songId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(bad.status()).toBe(422);
});
