import { USERS } from "@greenroom/db";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIG_IDS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { BAND, FakeDrive, clientFor, setupDrive } from "./api-media-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const media = (gig = GIG_IDS.upcomingClub) =>
  `/bands/${BAND}/gigs/${gig}/media`;

async function addItems(
  fake: FakeDrive,
  ava: Awaited<ReturnType<typeof clientFor>>,
  files: { name: string; content: string; mimeType?: string }[],
  gig = GIG_IDS.upcomingClub,
) {
  await ava.post(`${media(gig)}/folders`, { data: { name: "tmp" } });
  const gigFolderId = (await fake.byName("tmp"))!.parentId!;
  for (const f of files)
    await fake.external({
      action: "add",
      name: f.name,
      parentId: gigFolderId,
      content: f.content,
      mimeType: f.mimeType ?? "video/mp4",
    });
  await fake.poll();
  const after = await (await ava.get(media(gig))).json();
  return after.unsorted as { id: string; name: string }[];
}

test("content honors Range requests with 206", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const [item] = await addItems(fake, ava, [
    { name: "clip.mp4", content: "0123456789abcdefghij" },
  ]);
  const url = `/bands/${BAND}/media/${item!.id}/content`;

  const full = await ava.get(url);
  expect(full.status()).toBe(200);
  expect(full.headers()["accept-ranges"]).toBe("bytes");
  expect((await full.body()).toString()).toBe("0123456789abcdefghij");

  const part = await ava.get(url, { headers: { Range: "bytes=5-9" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe("bytes 5-9/20");
  expect(part.headers()["content-length"]).toBe("5");
  expect((await part.body()).toString()).toBe("56789");

  const open = await ava.get(url, { headers: { Range: "bytes=15-" } });
  expect(open.status()).toBe(206);
  expect(open.headers()["content-range"]).toBe("bytes 15-19/20");
  expect((await open.body()).toString()).toBe("fghij");

  const suffix = await ava.get(url, { headers: { Range: "bytes=-4" } });
  expect(suffix.status()).toBe(206);
  expect((await suffix.body()).toString()).toBe("ghij");

  const clamped = await ava.get(url, { headers: { Range: "bytes=18-99" } });
  expect(clamped.headers()["content-range"]).toBe("bytes 18-19/20");

  const past = await ava.get(url, { headers: { Range: "bytes=50-60" } });
  expect(past.status()).toBe(416);
  expect(past.headers()["content-range"]).toBe("bytes */20");
});

function listZip(buf: Buffer): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const file = join(dir, "x.zip");
  writeFileSync(file, buf);
  const names = execFileSync("unzip", ["-Z1", file])
    .toString()
    .trim()
    .split("\n");
  const out: Record<string, string> = {};
  for (const n of names)
    out[n] = execFileSync("unzip", ["-p", file, n]).toString();
  return out;
}

test("zip contains the selected files with deduped names", async ({
  testApi,
}) => {
  const seed = await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const items = await addItems(fake, ava, [
    { name: "a.mp4", content: "AAA" },
    { name: "b.mp4", content: "BBB" },
  ]);
  const a = items.find((i) => i.name === "a.mp4")!;
  const b = items.find((i) => i.name === "b.mp4")!;
  // A second "a.mp4" in a subfolder of the same gig.
  const sub = await (
    await ava.post(`${media()}/folders`, { data: { name: "Stage" } })
  ).json();
  await fake.external({
    action: "add",
    name: "a.mp4",
    parentId: (await fake.byName("Stage"))!.id,
    content: "A2",
    mimeType: "video/mp4",
  });
  await fake.poll();
  const gm = await (await ava.get(media())).json();
  const a2 = gm.folders.find((f: { id: string }) => f.id === sub.id).items[0];

  const res = await ava.get(`/bands/${BAND}/media/zip`, {
    params: { ids: [a.id, a2.id, b.id].join(",") },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  expect(res.headers()["content-disposition"]).toContain(
    `${seed.gigs.upcomingClub.title} media.zip`,
  );
  expect(listZip(Buffer.from(await res.body()))).toEqual({
    "a.mp4": "AAA",
    "a (2).mp4": "A2",
    "b.mp4": "BBB",
  });

  // A file deleted in Drive is skipped and listed in missing.txt.
  await fake.external({
    action: "delete",
    fileId: (await fake.byName("b.mp4"))!.id,
  });
  const partial = await ava.get(`/bands/${BAND}/media/zip`, {
    params: { ids: [a.id, b.id].join(",") },
  });
  expect(partial.status()).toBe(200);
  const entries = listZip(Buffer.from(await partial.body()));
  expect(Object.keys(entries).sort()).toEqual(["a.mp4", "missing.txt"]);
  expect(entries["missing.txt"]).toContain("b.mp4");
});

test("zip validation and membership", async ({ testApi }) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const [item] = await addItems(fake, ava, [{ name: "a.mp4", content: "A" }]);
  const zip = `/bands/${BAND}/media/zip`;
  expect((await ava.get(zip)).status()).toBe(422);
  expect((await ava.get(zip, { params: { ids: "nope" } })).status()).toBe(422);
  expect(
    (
      await ava.get(zip, {
        params: { ids: "00000000-0000-4000-8000-000000000000" },
      })
    ).status(),
  ).toBe(422);
  const many = Array.from(
    { length: 201 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  ).join(",");
  expect((await ava.get(zip, { params: { ids: many } })).status()).toBe(422);
  const outsider = await clientFor(testApi, "outsider@example.com");
  expect(
    (await outsider.get(zip, { params: { ids: item!.id } })).status(),
  ).toBe(404);
});
