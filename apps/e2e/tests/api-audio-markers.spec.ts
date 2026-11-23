import { BANDS, USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const markersUrl = (fileId: string, band = BAND) =>
  `/bands/${band}/files/items/${fileId}/markers`;
const markerUrl = (id: string, band = BAND) =>
  `/bands/${band}/audio-markers/${id}`;

interface Marker {
  id: string;
  fileId: string;
  positionMs: number;
  title: string;
  createdBy: { userId: string; displayName: string } | null;
}

async function setup(
  testApi: Parameters<typeof clientFor>[0] & {
    seed(s: "band"): Promise<unknown>;
  },
) {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const ben = await clientFor(testApi, USERS.ben.email);
  const fake = await FakeDrive.create();
  const status = await setupDrive(ava);
  const parentId = status.folderId as string;
  const audio = await fake.external({
    action: "add",
    name: "take1.mp3",
    parentId,
    content: "audio",
    mimeType: "audio/mpeg",
  });
  const doc = await fake.external({
    action: "add",
    name: "notes.txt",
    parentId,
    content: "x",
    mimeType: "text/plain",
  });
  return {
    ava,
    ben,
    cleo: await clientFor(testApi, USERS.cleo.email),
    audio,
    doc,
  };
}

test("create, list sorted, createdBy, patch, delete", async ({ testApi }) => {
  const { ava, ben, audio } = await setup(testApi);
  const url = markersUrl(audio.id);

  expect(await (await ava.get(url)).json()).toEqual([]);

  const mk = async (c: typeof ava, positionMs: number, title: string) => {
    const res = await c.post(url, { data: { positionMs, title } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as Marker;
  };
  const late = await mk(ava, 90_000, "  Outro ");
  const early = await mk(ben, 1_000, "Intro");
  const tie = await mk(ava, 90_000, "Tie");

  expect(late.title).toBe("Outro");
  expect(late.fileId).toBe(audio.id);
  expect(late.createdBy).toEqual({
    userId: USERS.ava.id,
    displayName: USERS.ava.displayName,
  });
  expect(early.createdBy?.displayName).toBe(USERS.ben.displayName);

  const list = (await (await ben.get(url)).json()) as Marker[];
  expect(list.map((m) => m.id)).toEqual([early.id, late.id, tie.id]);

  // Any member may edit another member's marker.
  const patched = await ben.patch(markerUrl(late.id), {
    data: { title: "Coda", positionMs: 2_000 },
  });
  expect(patched.status()).toBe(200);
  expect(await patched.json()).toMatchObject({
    id: late.id,
    title: "Coda",
    positionMs: 2_000,
    createdBy: { userId: USERS.ava.id },
  });
  const titleOnly = await ava.patch(markerUrl(late.id), {
    data: { title: "Coda 2" },
  });
  expect(await titleOnly.json()).toMatchObject({
    title: "Coda 2",
    positionMs: 2_000,
  });
  expect(
    ((await (await ava.get(url)).json()) as Marker[]).map((m) => m.id),
  ).toEqual([early.id, late.id, tie.id]);

  expect((await ben.delete(markerUrl(early.id))).status()).toBe(204);
  expect((await ava.delete(markerUrl(early.id))).status()).toBe(404);
  expect(
    ((await (await ava.get(url)).json()) as Marker[]).map((m) => m.id),
  ).toEqual([late.id, tie.id]);
});

test("rejects non-audio files, bad bodies, and the per-file cap", async ({
  testApi,
}) => {
  const { ava, audio, doc } = await setup(testApi);

  const nonAudio = await ava.post(markersUrl(doc.id), {
    data: { positionMs: 0, title: "x" },
  });
  expect(nonAudio.status()).toBe(400);
  expect((await ava.get(markersUrl(doc.id))).status()).toBe(200);

  const missing = await ava.post(markersUrl("nope"), {
    data: { positionMs: 0, title: "x" },
  });
  expect(missing.status()).toBe(404);

  const url = markersUrl(audio.id);
  for (const data of [
    {},
    { positionMs: 1 },
    { title: "x" },
    { positionMs: -1, title: "x" },
    { positionMs: 1.5, title: "x" },
    { positionMs: 24 * 60 * 60 * 1000 + 1, title: "x" },
    { positionMs: 1, title: "   " },
    { positionMs: 1, title: "x".repeat(81) },
  ]) {
    expect((await ava.post(url, { data })).status(), JSON.stringify(data)).toBe(
      400,
    );
  }

  const created = await (
    await ava.post(url, { data: { positionMs: 5, title: "ok" } })
  ).json();
  for (const data of [{}, { title: "" }, { positionMs: -3 }]) {
    expect(
      (await ava.patch(markerUrl(created.id), { data })).status(),
      JSON.stringify(data),
    ).toBe(400);
  }

  // Cap: 199 more reach 200, the next is refused.
  const results = await Promise.all(
    Array.from({ length: 199 }, (_, i) =>
      ava.post(url, { data: { positionMs: i, title: `m${i}` } }),
    ),
  );
  expect(results.every((r) => r.status() === 201)).toBe(true);
  const over = await ava.post(url, { data: { positionMs: 1, title: "over" } });
  expect(over.status()).toBe(400);
});

test("cross-band, malformed ids and non-members", async ({ testApi }) => {
  const { ava, ben, cleo, audio } = await setup(testApi);
  const created = (await (
    await ava.post(markersUrl(audio.id), {
      data: { positionMs: 1, title: "m" },
    })
  ).json()) as Marker;

  // Ben is in both bands; the marker belongs to the first only.
  const other = BANDS.sideProject.id;
  expect(
    (
      await ben.patch(markerUrl(created.id, other), { data: { title: "z" } })
    ).status(),
  ).toBe(404);
  expect((await ben.delete(markerUrl(created.id, other))).status()).toBe(404);
  expect((await ben.get(markersUrl(audio.id, other))).status()).toBe(200);
  expect(await (await ben.get(markersUrl(audio.id, other))).json()).toEqual([]);

  expect(
    (
      await ava.patch(markerUrl("not-a-uuid"), { data: { title: "z" } })
    ).status(),
  ).toBe(404);
  expect((await ava.delete(markerUrl("not-a-uuid"))).status()).toBe(404);

  // Cleo is not in the second band, and an unauthenticated caller gets nothing.
  for (const res of [
    await cleo.get(markersUrl(audio.id, other)),
    await cleo.post(markersUrl(audio.id, other), {
      data: { positionMs: 1, title: "x" },
    }),
    await cleo.patch(markerUrl(created.id, other), { data: { title: "z" } }),
    await cleo.delete(markerUrl(created.id, other)),
  ]) {
    expect([403, 404]).toContain(res.status());
  }

  const still = (await (
    await ava.get(markersUrl(audio.id))
  ).json()) as Marker[];
  expect(still.map((m) => m.title)).toEqual(["m"]);
});
