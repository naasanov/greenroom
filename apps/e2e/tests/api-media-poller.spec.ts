import { GIG_IDS, USERS, mediaItems } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  BAND,
  FakeDrive,
  clientFor,
  linkDrive,
  setupDrive,
} from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const GIG = GIG_IDS.upcomingClub;
const media = `/bands/${BAND}/gigs/${GIG}/media`;

test("poller reconciles add, rename, move, trash, delete, and new subfolders", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const folder = await (
    await ava.post(`${media}/folders`, { data: { name: "Stage" } })
  ).json();
  const gigFolder = (await fake.files()).find((f) =>
    /^\d{4}-\d\d-\d\d /.test(f.name),
  )!;
  const stageDrive = (await fake.byName("Stage"))!;
  const names = async () => {
    const m = await (await ava.get(media)).json();
    return {
      unsorted: m.unsorted.map((i: { name: string }) => i.name),
      folders: Object.fromEntries(
        m.folders.map((f: { name: string; items: { name: string }[] }) => [
          f.name,
          f.items.map((i) => i.name),
        ]),
      ),
      m,
    };
  };

  // Added directly in the gig folder and in a known subfolder.
  const x = await fake.external({
    action: "add",
    name: "x.jpg",
    parentId: gigFolder.id,
    mimeType: "image/jpeg",
  });
  const y = await fake.external({
    action: "add",
    name: "y.jpg",
    parentId: stageDrive.id,
    mimeType: "image/jpeg",
  });
  const z = await fake.external({
    action: "add",
    name: "z.jpg",
    parentId: gigFolder.id,
    mimeType: "image/jpeg",
  });
  // Unrelated files elsewhere in Drive are ignored.
  const gigsRoot = (await fake.byName("Gigs"))!;
  await fake.external({
    action: "add",
    name: "stray.jpg",
    parentId: gigsRoot.id,
  });
  await fake.external({ action: "add", name: "root.jpg", parentId: "root" });
  const polled = await fake.poll();
  expect(polled[0].status).toBe("polled");
  let n = await names();
  expect(n.unsorted).toEqual(["x.jpg", "z.jpg"]);
  expect(n.folders["Stage"]).toEqual(["y.jpg"]);
  const rows = await db.select().from(mediaItems);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.uploadedByUserId === null)).toBe(true);

  // Idempotent: a second pass changes nothing.
  await fake.poll();
  expect((await db.select().from(mediaItems)).length).toBe(3);

  // Rename and move among the gig's folders.
  await fake.external({ action: "rename", fileId: x.id, name: "renamed.jpg" });
  await fake.external({
    action: "move",
    fileId: z.id,
    parentId: stageDrive.id,
  });
  await fake.poll();
  n = await names();
  expect(n.unsorted).toEqual(["renamed.jpg"]);
  expect(n.folders["Stage"]).toEqual(["y.jpg", "z.jpg"]);
  const [renamedRow] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.driveFileId, x.id));
  expect(renamedRow!.nameCustomized).toBe(true);

  // Subfolder renamed and a new one created in Drive.
  await fake.external({
    action: "rename",
    fileId: stageDrive.id,
    name: "Stage 2",
  });
  const fresh = await fake.external({
    action: "folder",
    name: "Backstage",
    parentId: gigFolder.id,
  });
  await fake.external({
    action: "add",
    name: "w.jpg",
    parentId: fresh.id,
    mimeType: "image/jpeg",
  });
  await fake.poll();
  n = await names();
  expect(Object.keys(n.folders)).toEqual(["Stage 2", "Backstage"]);
  expect(n.folders["Backstage"]).toEqual(["w.jpg"]);
  expect(n.m.folders[1].id).toBe(
    (await (await ava.get(media)).json()).folders[1].id,
  );
  expect(folder.id).toBe(n.m.folders[0].id);

  // Moving out of the gig's folders removes it; trash hides; delete marks missing.
  await fake.external({ action: "move", fileId: y.id, parentId: "root" });
  await fake.external({ action: "trash", fileId: z.id });
  await fake.external({ action: "delete", fileId: x.id });
  await fake.poll();
  n = await names();
  expect(n.folders["Stage 2"]).toEqual([]);
  expect(n.unsorted).toEqual(["renamed.jpg"]);
  expect(n.m.unsorted[0].missing).toBe(true);
  const [trashedRow] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.driveFileId, z.id));
  expect(trashedRow!.trashedAt).not.toBeNull();

  // Restoring from Drive trash brings it back.
  await fake.external({ action: "move", fileId: y.id, parentId: gigFolder.id });
  await fake.poll();
  expect((await names()).unsorted).toContain("y.jpg");
});

test("poller skips unlinked bands and a revoked link", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  expect(await fake.poll()).toEqual([]);
  await linkDrive(ava);
  // Linked but no folder chosen yet: no cursor, so the pass is skipped.
  expect((await fake.poll())[0].status).toBe("skipped");
  await setupDrive(ava);
  expect((await fake.poll())[0].status).toBe("polled");
  await ava.delete(`/bands/${BAND}/integrations/google/drive`);
  expect(await fake.poll()).toEqual([]);
});
