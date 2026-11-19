import { readFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "../src/fixtures.js";
import { BAND } from "./api-media-helpers.js";
import {
  sendRange,
  uploadsUrl,
  createBody,
  type Sess,
} from "./api-uploads-helpers.js";

// libheif tests/data/rainbow-451x461.heic (7 KB, a real HEVC image), see https://github.com/strukturag/libheif.
export const HEIC = readFileSync(
  new URL("../fixtures/rainbow-451x461.heic", import.meta.url),
);

/** Not a HEIC container; the decoder rejects it. */
export const CORRUPT_HEIC = Buffer.concat([
  Buffer.from("not really a heic file "),
  HEIC.subarray(0, 64),
]);

/** Not decodable: a valid-looking `ftyp` box followed by garbage with no `meta` box. */
export const UNPARSEABLE_HEIC = Buffer.concat([
  HEIC.subarray(0, HEIC.readUInt32BE(0)),
  Buffer.alloc(64, 0xab),
]);

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}

/** A well-formed container whose `ipco` holds `count` empty 8-byte `free` boxes. */
export function manyBoxesHeic(count: number): Buffer {
  const ipco = box("ipco", Buffer.concat(Array(count).fill(box("free"))));
  const pitm = box("pitm", Buffer.from([0, 0, 0, 0, 0, 1]));
  const meta = box("meta", Buffer.alloc(4), pitm, box("iprp", ipco));
  return Buffer.concat([HEIC.subarray(0, HEIC.readUInt32BE(0)), meta]);
}

/** A copy of the HEIC whose `ispe` width and height fields are overwritten. */
export function withDimensions(
  heic: Buffer,
  width: number,
  height: number,
): Buffer {
  const out = Buffer.from(heic);
  let at = out.indexOf("ispe");
  expect(at, "fixture has an ispe box").toBeGreaterThan(0);
  while (at >= 0) {
    out.writeUInt32BE(width, at + 8);
    out.writeUInt32BE(height, at + 12);
    at = out.indexOf("ispe", at + 4);
  }
  return out;
}

export const isJpeg = (b: Buffer): boolean =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Uploads a whole file through the gig upload API and returns the completed session. */
export async function uploadGigFile(
  api: APIRequestContext,
  data: Buffer,
  fileName: string,
  mimeType: string,
  chunk?: number,
): Promise<Sess> {
  const res = await api.post(uploadsUrl(), {
    data: createBody(data, {
      fileName,
      mimeType,
      fingerprint: `${fileName}:${data.length}`,
    }),
  });
  expect(res.status(), await res.text()).toBe(200);
  const s: Sess = await res.json();
  return sendRange(api, s.id, data, 0, data.length, chunk);
}

export const MEDIA_ITEM_ROUTE = (id: string) => `/bands/${BAND}/media/${id}`;
