import { GIG_IDS } from "@greenroom/db";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";

export const GIG = GIG_IDS.upcomingClub;
export const CHUNK = 256 * 1024;
export const uploadsUrl = (gig = GIG) => `/bands/${BAND}/gigs/${gig}/uploads`;
export const sessionUrl = (id: string) => `/bands/${BAND}/uploads/${id}`;

/** Deterministic pseudo-random bytes so chunk mixups are detected. */
export function bytes(size: number, seed = 1): Buffer {
  const b = Buffer.alloc(size);
  let x = seed;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x >> 16;
  }
  return b;
}

export interface Sess {
  id: string;
  status: string;
  bytesReceived: number;
  totalBytes: number;
  chunkSize: number;
  fileName: string;
  folderId: string | null;
  songId: string | null;
  item: { id: string; name: string; songId: string | null } | null;
}

export function createBody(
  data: Buffer,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    totalBytes: data.length,
    fingerprint: `clip.mp4:${data.length}:1`,
    folderId: null,
    ...over,
  };
}

export async function createUpload(
  api: APIRequestContext,
  data: Buffer,
  over: Record<string, unknown> = {},
  gig = GIG,
): Promise<Sess> {
  const res = await api.post(uploadsUrl(gig), { data: createBody(data, over) });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

export function putChunk(
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

/** Sends [from, to) in CHUNK-sized pieces; returns the last response body. */
export async function sendRange(
  api: APIRequestContext,
  id: string,
  data: Buffer,
  from: number,
  to = data.length,
  chunk = CHUNK,
): Promise<Sess> {
  let last: Sess | undefined;
  for (let s = from; s < to; s += chunk) {
    const res = await putChunk(api, id, data, s, Math.min(s + chunk, to));
    expect(res.status(), await res.text()).toBe(200);
    last = await res.json();
  }
  return last!;
}
