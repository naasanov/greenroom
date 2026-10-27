import { USERS, driveSyncCursors, bands } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  BAND,
  DRIVE,
  FakeDrive,
  clientFor,
  linkDrive,
  setupDrive,
} from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

test("folder setup: validation, fake picker, structure, reuse, replace", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();

  expect((await ava.get(`${DRIVE}/status`)).json()).resolves.toMatchObject({
    linked: false,
    folderSet: false,
  });
  expect((await ava.get(`${DRIVE}/fake-picker`)).status()).toBe(409);
  const unlinked = await ava.post(`${DRIVE}/folder`, {
    data: { folderId: "x" },
  });
  expect(unlinked.status()).toBe(409);
  expect((await unlinked.json()).code).toBe("GOOGLE_NOT_LINKED");

  await linkDrive(ben);
  const picker = await (await ava.get(`${DRIVE}/fake-picker`)).json();
  expect(picker.folders.map((f: { name: string }) => f.name).sort()).toEqual([
    "Band stuff",
    "Greenroom demo",
  ]);

  // Not a folder, unknown, trashed, and malformed ids are rejected.
  const file = await fake.external({
    action: "add",
    name: "a.txt",
    parentId: "root",
  });
  expect(
    (
      await ava.post(`${DRIVE}/folder`, { data: { folderId: file.id } })
    ).status(),
  ).toBe(422);
  expect(
    (
      await ava.post(`${DRIVE}/folder`, { data: { folderId: "nope" } })
    ).status(),
  ).toBe(422);
  const trashed = await fake.external({ action: "folder", name: "Old" });
  await fake.external({ action: "trash", fileId: trashed.id });
  expect(
    (
      await ava.post(`${DRIVE}/folder`, { data: { folderId: trashed.id } })
    ).status(),
  ).toBe(422);
  expect((await ava.post(`${DRIVE}/folder`, { data: {} })).status()).toBe(400);

  // Reuses an existing Gigs folder, creates Profile photos.
  const stuff = picker.folders.find(
    (f: { name: string }) => f.name === "Band stuff",
  );
  const existingGigs = await fake.external({
    action: "folder",
    name: "Gigs",
    parentId: stuff.id,
  });
  const res = await ben.post(`${DRIVE}/folder`, {
    data: { folderId: stuff.id },
  });
  expect(res.status()).toBe(200);
  const status = await res.json();
  expect(status).toMatchObject({
    linked: true,
    folderSet: true,
    folderId: stuff.id,
    gigsFolderId: existingGigs.id,
  });
  const photos = (await fake.files()).find((f) => f.name === "Profile photos");
  expect(photos?.parentId).toBe(stuff.id);
  expect(status.photosFolderId).toBe(photos!.id);
  expect((await fake.files()).filter((f) => f.name === "Gigs")).toHaveLength(1);

  const [band] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(band).toMatchObject({
    driveRootFolderId: stuff.id,
    driveGigsFolderId: existingGigs.id,
  });
  expect(await db.select().from(driveSyncCursors)).toHaveLength(1);

  // Repeating is idempotent; picking another folder swaps the pointers.
  await ava.post(`${DRIVE}/folder`, { data: { folderId: stuff.id } });
  expect((await fake.files()).filter((f) => f.name === "Gigs")).toHaveLength(1);
  const demo = picker.folders.find(
    (f: { name: string }) => f.name === "Greenroom demo",
  );
  const swapped = await (
    await ava.post(`${DRIVE}/folder`, { data: { folderId: demo.id } })
  ).json();
  expect(swapped.gigsFolderId).not.toBe(existingGigs.id);
  expect(swapped.folderId).toBe(demo.id);
  expect(await db.select().from(driveSyncCursors)).toHaveLength(1);
});

test("non-members get 404 on drive routes", async ({ testApi }) => {
  await testApi.seed("band");
  const outsider = await clientFor(testApi, "outsider@example.com");
  expect((await outsider.get(`${DRIVE}/status`)).status()).toBe(404);
  expect(
    (
      await outsider.post(`${DRIVE}/folder`, { data: { folderId: "x" } })
    ).status(),
  ).toBe(404);
  expect((await outsider.get(`${DRIVE}/fake-picker`)).status()).toBe(404);
});

test("setup helper links and returns status", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const status = await setupDrive(ava);
  expect(status.folderSet).toBe(true);
  expect(status.folderUrl).toContain("drive.google.com/drive/folders/");
});
