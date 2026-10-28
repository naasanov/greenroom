import {
  USERS,
  publicUploadLinks,
  uploadSessions,
  mediaItems,
} from "@greenroom/db";
import { request, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
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
import { CHUNK, GIG, bytes } from "./api-uploads-helpers.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const linksUrl = `/bands/${BAND}/gigs/${GIG}/upload-links`;
const pub = (token: string) => `/public/upload-links/${token}`;
const tokenOf = (url: string) => url.split("/u/")[1]!;

async function setup(testApi: TestApi) {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const fake = await FakeDrive.create();
  await setupDrive(ava);
  const link = await (await ava.post(linksUrl, { data: {} })).json();
  return { ava, fake, link, token: tokenOf(link.url), pub: await anon() };
}

function body(data: Buffer, over: Record<string, unknown> = {}) {
  return {
    fileName: "photo.png",
    mimeType: "image/png",
    totalBytes: data.length,
    fingerprint: `photo.png:${data.length}:1`,
    ...over,
  };
}

function put(
  api: APIRequestContext,
  token: string,
  id: string,
  data: Buffer,
  from = 0,
  to = data.length,
) {
  return api.put(`${pub(token)}/uploads/${id}`, {
    data: data.subarray(from, to),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes ${from}-${to - 1}/${data.length}`,
    },
  });
}

test("admin creates, reuses, lists, and revokes a link", async ({
  testApi,
}) => {
  const { ava, link } = await setup(testApi);
  expect(link.url).toMatch(/\/u\/[A-Za-z0-9_-]{43}$/);
  expect(link).toMatchObject({
    revokedAt: null,
    uploadsCount: 0,
    bytesUsed: 0,
    createdBy: { id: USERS.ava.id },
  });
  expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());

  const again = await (await ava.post(linksUrl, { data: {} })).json();
  expect(again.id).toBe(link.id);
  const fresh = await (
    await ava.post(`${linksUrl}?new=1`, { data: { expiresInDaysAfterGig: 30 } })
  ).json();
  expect(fresh.id).not.toBe(link.id);
  expect(new Date(fresh.expiresAt).getTime()).toBeGreaterThan(
    new Date(link.expiresAt).getTime(),
  );
  expect(
    (await (await ava.get(linksUrl)).json()).map((l: { id: string }) => l.id),
  ).toEqual([fresh.id, link.id]);

  const bad = await ava.post(linksUrl, { data: { expiresInDaysAfterGig: 3 } });
  expect(bad.status()).toBe(400);

  // Any member may revoke.
  const ben = await clientFor(testApi, USERS.ben.email);
  const revoked = await (
    await ben.delete(`/bands/${BAND}/upload-links/${link.id}`)
  ).json();
  expect(revoked.revokedAt).not.toBeNull();
  const noLink = await ava.delete(
    `/bands/${BAND}/upload-links/00000000-0000-4000-8000-000000000000`,
  );
  expect(noLink.status()).toBe(404);
});

test("creating a link needs Drive; admin routes are member-only", async ({
  testApi,
}) => {
  await testApi.seed("band");
  const ava = await clientFor(testApi, USERS.ava.email);
  const res = await ava.post(linksUrl, { data: {} });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("GOOGLE_NOT_LINKED");

  const stranger = await clientFor(testApi, "stranger@example.com");
  expect((await stranger.post(linksUrl, { data: {} })).status()).toBe(404);
  expect((await stranger.get(linksUrl)).status()).toBe(404);
  const anonymous = await anon();
  expect((await anonymous.post(linksUrl, { data: {} })).status()).toBe(401);
  expect((await anonymous.get(linksUrl)).status()).toBe(401);
});

test("public info exposes only band name, gig title and date", async ({
  testApi,
}) => {
  const { token, pub: api } = await setup(testApi);
  const res = await api.get(pub(token));
  expect(res.status()).toBe(200);
  const info = await res.json();
  expect(Object.keys(info).sort()).toEqual([
    "allowedMimePrefixes",
    "bandName",
    "bandPhotoUrl",
    "expiresAt",
    "gigDate",
    "gigTitle",
    "maxFileBytes",
  ]);
  expect(info).toMatchObject({
    bandName: "The Night Owls",
    allowedMimePrefixes: ["image/", "video/"],
    maxFileBytes: 4 * 1024 ** 3,
  });
});

test("anonymous upload lands in Unsorted via the link", async ({
  testApi,
  db,
}) => {
  const { ava, fake, link, token, pub: api } = await setup(testApi);
  const data = bytes(CHUNK * 2 + 77, 5);
  const created = await api.post(`${pub(token)}/uploads`, {
    data: body(data, { uploaderName: "Sam" }),
  });
  expect(created.status()).toBe(200);
  const s = await created.json();
  expect(Object.keys(s).sort()).toEqual([
    "bytesReceived",
    "chunkSize",
    "fileName",
    "id",
    "status",
    "totalBytes",
  ]);

  const first = await (await put(api, token, s.id, data, 0, CHUNK)).json();
  expect(first).toMatchObject({ status: "uploading", bytesReceived: CHUNK });
  const bad = await put(api, token, s.id, data, 0, CHUNK);
  expect(bad.status()).toBe(409);
  expect((await bad.json()).bytesReceived).toBe(CHUNK);
  const done = await (await put(api, token, s.id, data, CHUNK)).json();
  expect(done.status).toBe("complete");

  const media = await (
    await ava.get(`/bands/${BAND}/gigs/${GIG}/media`)
  ).json();
  expect(media.unsorted).toHaveLength(1);
  const [item] = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, media.unsorted[0].id));
  expect(item!.uploadedViaLinkId).toBe(link.id);
  expect(item!.folderId).toBeNull();
  const [row] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, s.id));
  expect(row).toMatchObject({
    uploadedViaLinkId: link.id,
    uploaderName: "Sam",
  });
  const file = (await fake.files()).find((f) => f.name === "photo.png")!;
  expect(await fake.content(file.id)).toEqual(data);

  const listed = await (await ava.get(linksUrl)).json();
  expect(listed[0]).toMatchObject({ uploadsCount: 1, bytesUsed: data.length });
});

test("type and size limits are enforced", async ({ testApi, db }) => {
  const { token, pub: api } = await setup(testApi);
  const data = bytes(1000);
  const pdf = await api.post(`${pub(token)}/uploads`, {
    data: body(data, { mimeType: "application/pdf", fileName: "a.pdf" }),
  });
  expect(pdf.status()).toBe(422);
  expect((await pdf.json()).code).toBe("UPLOAD_TYPE_NOT_ALLOWED");
  const audio = await api.post(`${pub(token)}/uploads`, {
    data: body(data, { mimeType: "audio/mpeg" }),
  });
  expect(audio.status()).toBe(422);

  await db
    .update(publicUploadLinks)
    .set({ maxFileBytes: 500, maxTotalBytes: 1000 });
  const big = await api.post(`${pub(token)}/uploads`, { data: body(data) });
  expect(big.status()).toBe(422);
  expect((await big.json()).code).toBe("UPLOAD_TOO_LARGE");

  const a = bytes(400, 1);
  const b = bytes(450, 2);
  const c = bytes(300, 3);
  for (const [d, n] of [
    [a, "a"],
    [b, "b"],
  ] as const) {
    const ok = await api.post(`${pub(token)}/uploads`, {
      data: body(d, { fingerprint: n }),
    });
    expect(ok.status()).toBe(200);
  }
  // Re-sending an already counted file resumes it instead of adding bytes.
  const again = await api.post(`${pub(token)}/uploads`, {
    data: body(a, { fingerprint: "a" }),
  });
  expect(again.status()).toBe(200);
  const full = await api.post(`${pub(token)}/uploads`, {
    data: body(c, { fingerprint: "c" }),
  });
  expect(full.status()).toBe(422);
  expect((await full.json()).code).toBe("UPLOAD_LINK_FULL");
});

test("unknown, revoked, and expired links 404 with a reason", async ({
  testApi,
  db,
}) => {
  const { ava, link, token, pub: api } = await setup(testApi);
  const data = bytes(100);
  const reason = async (t: string) => {
    for (const res of [
      await api.get(pub(t)),
      await api.post(`${pub(t)}/uploads`, { data: body(data) }),
    ]) {
      expect(res.status()).toBe(404);
      const j = await res.json();
      expect(j.code).toBe("UPLOAD_LINK_INVALID");
    }
    return (await (await api.get(pub(t))).json()).reason;
  };
  expect(await reason("x".repeat(43))).toBe("unknown");

  await db
    .update(publicUploadLinks)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(publicUploadLinks.id, link.id));
  expect(await reason(token)).toBe("expired");

  await db
    .update(publicUploadLinks)
    .set({ expiresAt: new Date(Date.now() + 86_400_000) })
    .where(eq(publicUploadLinks.id, link.id));
  expect((await api.get(pub(token))).status()).toBe(200);
  await ava.delete(`/bands/${BAND}/upload-links/${link.id}`);
  expect(await reason(token)).toBe("revoked");
});

test("a session is only reachable through its own link", async ({
  testApi,
}) => {
  const { ava, link, token, pub: api } = await setup(testApi);
  const other = await (
    await ava.post(`${linksUrl}?new=1`, { data: {} })
  ).json();
  const otherToken = tokenOf(other.url);
  expect(other.id).not.toBe(link.id);
  const data = bytes(CHUNK + 5);
  const s = await (
    await api.post(`${pub(token)}/uploads`, { data: body(data) })
  ).json();
  expect((await put(api, otherToken, s.id, data, 0, CHUNK)).status()).toBe(404);
  const del = await api.delete(`${pub(otherToken)}/uploads/${s.id}`);
  expect(del.status()).toBe(404);
  const ok = await api.delete(`${pub(token)}/uploads/${s.id}`);
  expect(ok.status()).toBe(200);
  expect((await ok.json()).status).toBe("cancelled");
  // Member session routes do not accept link sessions.
  expect((await ava.get(`/bands/${BAND}/uploads/${s.id}`)).status()).toBe(404);
});

test("per-link and per-IP rate limits return 429", async ({ testApi }) => {
  const { token } = await setup(testApi);
  const make = (ip: string) =>
    request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { "x-test-ip": ip },
    });
  const api = await make(`ip-${Date.now()}`);
  const statuses: number[] = [];
  for (let i = 0; i < 61; i++) {
    const d = bytes(10, i + 1);
    const res = await api.post(`${pub(token)}/uploads`, {
      data: body(d, { fingerprint: `f${i}` }),
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
  expect(statuses[60]).toBe(429);
  // Another IP is unaffected until the per-link cap.
  const other = await make(`ip2-${Date.now()}`);
  const res = await other.post(`${pub(token)}/uploads`, {
    data: body(bytes(10, 99), { fingerprint: "other" }),
  });
  expect(res.status()).toBe(200);
  // Reads are not rate limited per file.
  expect((await api.get(pub(token))).status()).toBe(200);
});
