import { USERS, bands, memberships } from "@greenroom/db";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import {
  BAND,
  FakeDrive,
  PNG,
  anon,
  clientFor,
  setupDrive,
} from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const file = (name = "p.png", mimeType = "image/png", buffer = PNG) => ({
  multipart: { photo: { name, mimeType, buffer } },
});

test("band photo: upload, public serve, replace, delete, admin only", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const outsider = await clientFor(testApi, "outsider@example.com");
  const pub = await anon();
  const fake = await FakeDrive.create();

  // Unlinked: 409 on upload, 404 on serve.
  expect((await ava.put(`/bands/${BAND}/photo`, file())).status()).toBe(409);
  expect((await pub.get(`/bands/${BAND}/photo`)).status()).toBe(404);

  await setupDrive(ava);
  expect((await ben.put(`/bands/${BAND}/photo`, file())).status()).toBe(403);
  expect((await outsider.put(`/bands/${BAND}/photo`, file())).status()).toBe(
    404,
  );
  expect(
    (
      await ava.put(
        `/bands/${BAND}/photo`,
        file("a.txt", "text/plain", Buffer.from("hi")),
      )
    ).status(),
  ).toBe(422);
  expect(
    (
      await ava.put(`/bands/${BAND}/photo`, { multipart: { other: "x" } })
    ).status(),
  ).toBe(400);
  const big = Buffer.alloc(10 * 1024 * 1024 + 10);
  expect(
    (
      await ava.put(`/bands/${BAND}/photo`, file("big.png", "image/png", big))
    ).status(),
  ).toBe(413);

  const up = await ava.put(`/bands/${BAND}/photo`, file());
  expect(up.status()).toBe(200);
  const { photoUrl } = await up.json();
  const [band] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(photoUrl).toBe(
    `${new URL(photoUrl).origin}/bands/${BAND}/photo?v=${band!.photoDriveFileId}`,
  );
  expect(band!.photoUrl).toBe(photoUrl);
  const photosFolder = (await fake.byName("Profile photos"))!;
  const firstFile = (await fake.files()).find(
    (f) => f.id === band!.photoDriveFileId,
  )!;
  expect(firstFile.parentId).toBe(photosFolder.id);

  // Public, long cache, no session.
  const served = await pub.get(`/bands/${BAND}/photo`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["cache-control"]).toContain("max-age=31536000");
  expect(Buffer.from(await served.body()).equals(PNG)).toBe(true);

  // Replace trashes the previous file.
  await ava.put(`/bands/${BAND}/photo`, file());
  const [after] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(after!.photoDriveFileId).not.toBe(band!.photoDriveFileId);
  expect((await fake.files()).find((f) => f.id === firstFile.id)!.trashed).toBe(
    true,
  );

  expect((await ben.delete(`/bands/${BAND}/photo`)).status()).toBe(403);
  expect((await ava.delete(`/bands/${BAND}/photo`)).status()).toBe(204);
  const [cleared] = await db.select().from(bands).where(eq(bands.id, BAND));
  expect(cleared).toMatchObject({ photoUrl: null, photoDriveFileId: null });
  expect(
    (await fake.files()).find((f) => f.id === after!.photoDriveFileId)!.trashed,
  ).toBe(true);
  expect((await pub.get(`/bands/${BAND}/photo`)).status()).toBe(404);
});

test("profile photo: one per user, served to signed-in users, mirrored to band Drives", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const pub = await anon();
  const fake = await FakeDrive.create();
  const mine = "/users/me/photo";

  expect(
    (
      await ben.put(mine, file("a.txt", "text/plain", Buffer.from("x")))
    ).status(),
  ).toBe(422);
  expect((await pub.put(mine, file())).status()).toBe(401);

  // Works with no Drive linked; nothing to mirror yet.
  const up = await ben.put(mine, file());
  expect(up.status()).toBe(200);
  const { photoUrl } = await up.json();
  expect(photoUrl).toContain(`/users/${USERS.ben.id}/photo?v=`);
  expect((await (await ben.get("/auth/me")).json()).avatarUrl).toBe(photoUrl);

  // Signed-in users read it; anonymous cannot.
  const read = await ava.get(`/users/${USERS.ben.id}/photo`);
  expect(read.status()).toBe(200);
  expect(Buffer.from(await read.body()).equals(PNG)).toBe(true);
  expect((await pub.get(`/users/${USERS.ben.id}/photo`)).status()).toBe(401);
  expect((await ava.get(`/users/${USERS.ava.id}/photo`)).status()).toBe(404);

  // Members lists carry it as avatarUrl; there is no separate band photoUrl.
  const members = await (await ava.get(`/bands/${BAND}/members`)).json();
  const row = members.find(
    (m: { userId: string }) => m.userId === USERS.ben.id,
  );
  expect(row.avatarUrl).toBe(photoUrl);
  expect(row).not.toHaveProperty("photoUrl");

  // Linking Drive later, then changing the photo, mirrors it into the folder.
  await setupDrive(ava);
  expect((await ben.put(mine, file())).status()).toBe(200);
  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, USERS.ben.id), eq(memberships.bandId, BAND)),
    );
  const first = m!.photoDriveFileId!;
  expect(first).toBeTruthy();
  expect((await fake.files()).some((f) => f.id === first)).toBe(true);

  await ben.put(mine, file());
  expect((await fake.files()).find((f) => f.id === first)!.trashed).toBe(true);

  expect((await ben.delete(mine)).status()).toBe(204);
  expect(
    (await ben.get(mine.replace("/me/", `/${USERS.ben.id}/`))).status(),
  ).toBe(404);
  expect((await (await ben.get("/auth/me")).json()).avatarUrl).toBeNull();
  const [cleared] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, USERS.ben.id), eq(memberships.bandId, BAND)),
    );
  expect(cleared!.photoDriveFileId).toBeNull();
});
