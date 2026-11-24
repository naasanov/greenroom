import { SONGS, USERS, driveFileSongLinks } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const itemUrl = (id: string) => `/bands/${BAND}/files/items/${id}/songs`;
const songUrl = (songId: string) => `/bands/${BAND}/songs/${songId}/files`;

async function names(api: APIRequestContext, songId: string) {
  const res = await api.get(songUrl(songId));
  expect(res.status()).toBe(200);
  const files = (await res.json()) as { name: string }[];
  return files.map((f) => f.name).sort();
}

test("a folder linked to a song attaches its top-level files, now and on later polls", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const root = status.folderId as string;
  const skyline = SONGS.skyline.id;
  const planes = SONGS.paperPlanes.id;
  const add = (name: string, parentId: string) =>
    fake.external({ action: "add", name, parentId, mimeType: "image/png" });

  const folder = await fake.external({
    action: "folder",
    name: "Skyline stuff",
    parentId: root,
  });
  const sub = await fake.external({
    action: "folder",
    name: "Nested",
    parentId: folder.id,
  });
  await add("a.png", folder.id);
  await add("b.png", folder.id);
  const manual = await add("c.png", folder.id);
  await add("deep.png", sub.id);

  // A hand-made link on one of the files survives the folder being unlinked.
  expect(
    (
      await ava.put(itemUrl(manual.id), { data: { songIds: [skyline] } })
    ).status(),
  ).toBe(200);

  // Linking backfills the 3 top-level files; the subfolder's file is ignored.
  const link = () =>
    ava.put(itemUrl(folder.id), { data: { songIds: [skyline, planes] } });
  expect((await link()).status()).toBe(200);
  expect(await names(ava, skyline)).toEqual([
    "Skyline stuff",
    "a.png",
    "b.png",
    "c.png",
  ]);
  expect(await names(ava, planes)).toEqual([
    "Skyline stuff",
    "a.png",
    "b.png",
    "c.png",
  ]);

  // Linking again, and polling the same changes, creates no duplicates.
  expect((await link()).status()).toBe(200);
  await fake.poll();
  await fake.poll();
  const rows = () =>
    db
      .select()
      .from(driveFileSongLinks)
      .where(eq(driveFileSongLinks.songId, skyline));
  expect(await rows()).toHaveLength(4);

  // A file added later appears after the next poll; one in the subfolder does not.
  await add("d.png", folder.id);
  await add("deep2.png", sub.id);
  expect(await names(ava, skyline)).not.toContain("d.png");
  await fake.poll();
  expect(await names(ava, skyline)).toEqual([
    "Skyline stuff",
    "a.png",
    "b.png",
    "c.png",
    "d.png",
  ]);
  expect(await names(ava, planes)).toContain("d.png");

  // Moving a file out of the folder drops its auto link, trashing keeps it unavailable.
  const a = (await fake.byName("a.png"))!;
  const b = (await fake.byName("b.png"))!;
  await fake.external({ action: "move", fileId: a.id, parentId: root });
  await fake.external({ action: "trash", fileId: b.id });
  await fake.poll();
  const after = (await (await ava.get(songUrl(skyline))).json()) as {
    name: string;
    available: boolean;
  }[];
  expect(after.map((f) => f.name).sort()).toEqual([
    "Skyline stuff",
    "b.png",
    "c.png",
    "d.png",
  ]);
  expect(after.find((f) => f.name === "b.png")!.available).toBe(false);

  // Dropping one song from the folder removes only that song's auto links.
  await ava.put(itemUrl(folder.id), { data: { songIds: [skyline] } });
  expect(await names(ava, planes)).toEqual([]);
  expect(await names(ava, skyline)).toContain("d.png");

  // Hand-linking an auto-linked file takes it over, so it outlives the folder link.
  const f = await add("f.png", folder.id);
  await fake.poll();
  expect(await names(ava, skyline)).toContain("f.png");
  expect(
    (await ava.put(itemUrl(f.id), { data: { songIds: [skyline] } })).status(),
  ).toBe(200);

  // Unlinking the folder removes its auto links and keeps the manual ones.
  const d = (await fake.byName("d.png"))!;
  const del = await ava.delete(`${songUrl(skyline)}/${folder.id}`);
  expect(del.status()).toBe(204);
  expect(await names(ava, skyline)).toEqual(["c.png", "f.png"]);
  await add("e.png", folder.id);
  await fake.poll();
  expect(await names(ava, skyline)).toEqual(["c.png", "f.png"]);
  expect(
    await db
      .select()
      .from(driveFileSongLinks)
      .where(
        and(
          eq(driveFileSongLinks.songId, skyline),
          eq(driveFileSongLinks.driveFileId, d.id),
        ),
      ),
  ).toEqual([]);
});
