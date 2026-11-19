/** Largest HEIC/HEIF file the server will decode; bigger ones are kept as uploaded. */
export const HEIC_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Largest HEIC/HEIF image (width * height) the server will decode. Decoding
 * holds several RGBA-sized buffers at once, which must fit the smallest API
 * machine; a 12 MP phone photo (4032x3024) is under it.
 */
export const HEIC_MAX_PIXELS = 16_000_000;

const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/x-heic",
  "image/x-heif",
]);
const HEIC_EXT = /\.(heic|heif)$/i;

/**
 * True for a HEIC/HEIF file: by its mime type, or by extension when the
 * browser reported no type or `application/octet-stream` (Chrome on Mac).
 */
export function isHeic(
  mimeType: string | null | undefined,
  name: string,
): boolean {
  const m = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if (HEIC_MIMES.has(m)) return true;
  return (m === "" || m === "application/octet-stream") && HEIC_EXT.test(name);
}

/** The name with its HEIC/HEIF extension replaced by `.jpg`. */
export function jpegName(name: string): string {
  return HEIC_EXT.test(name) ? name.replace(HEIC_EXT, ".jpg") : `${name}.jpg`;
}

/** A specific image mime for a HEIC file whose reported type was empty or generic. */
export function heicMime(mimeType: string, name: string): string {
  if (!isHeic(mimeType, name) || HEIC_MIMES.has(mimeType.toLowerCase()))
    return mimeType;
  return /\.heif$/i.test(name) ? "image/heif" : "image/heic";
}

interface Box {
  type: string;
  /** Offset of the first byte after the box header. */
  start: number;
  end: number;
}

/** Child boxes of `[start, end)`; throws on a size that does not fit. */
function boxesIn(buf: Buffer, start: number, end: number): Box[] {
  const out: Box[] = [];
  let pos = start;
  while (pos < end) {
    if (end - pos < 8) throw new Error("truncated box header");
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (end - pos < 16) throw new Error("truncated box header");
      const big = buf.readBigUInt64BE(pos + 8);
      if (big > BigInt(end - pos)) throw new Error("box too large");
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || size > end - pos) throw new Error("bad box size");
    out.push({ type, start: pos + header, end: pos + size });
    pos += size;
  }
  return out;
}

function need(box: Box, bytes: number): void {
  if (box.end - box.start < bytes) throw new Error(`short ${box.type} box`);
}

/**
 * Width and height of a HEIC/HEIF file's primary image, from the `ispe`
 * property associated with the primary item. Null when the container cannot
 * be parsed or does not declare usable dimensions.
 */
export function heicDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  try {
    const meta = boxesIn(buf, 0, buf.length).find((b) => b.type === "meta");
    if (!meta) return null;
    need(meta, 4);
    const kids = boxesIn(buf, meta.start + 4, meta.end);

    const pitm = kids.find((b) => b.type === "pitm");
    if (!pitm) return null;
    need(pitm, 6);
    const primary =
      buf[pitm.start] === 0
        ? buf.readUInt16BE(pitm.start + 4)
        : (need(pitm, 8), buf.readUInt32BE(pitm.start + 4));

    const iprp = kids.find((b) => b.type === "iprp");
    if (!iprp) return null;
    const iprpKids = boxesIn(buf, iprp.start, iprp.end);
    const ipco = iprpKids.find((b) => b.type === "ipco");
    if (!ipco) return null;
    const props = boxesIn(buf, ipco.start, ipco.end);

    for (const ipma of iprpKids.filter((b) => b.type === "ipma")) {
      for (const index of primaryProperties(buf, ipma, primary)) {
        const prop = props[index - 1];
        if (!prop || prop.type !== "ispe") continue;
        need(prop, 12);
        const width = buf.readUInt32BE(prop.start + 4);
        const height = buf.readUInt32BE(prop.start + 8);
        return width > 0 && height > 0 ? { width, height } : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** 1-based property indexes the `ipma` box associates with `itemId`. */
function primaryProperties(buf: Buffer, ipma: Box, itemId: number): number[] {
  need(ipma, 8);
  const version = buf[ipma.start]!;
  const wide = (buf[ipma.start + 3]! & 1) === 1;
  const count = buf.readUInt32BE(ipma.start + 4);
  let pos = ipma.start + 8;
  for (let i = 0; i < count; i++) {
    const idSize = version < 1 ? 2 : 4;
    if (pos + idSize + 1 > ipma.end) throw new Error("short ipma entry");
    const id = version < 1 ? buf.readUInt16BE(pos) : buf.readUInt32BE(pos);
    const n = buf[pos + idSize]!;
    pos += idSize + 1;
    const step = wide ? 2 : 1;
    if (pos + n * step > ipma.end) throw new Error("short ipma entry");
    if (id === itemId) {
      const out: number[] = [];
      for (let k = 0; k < n; k++) {
        const at = pos + k * step;
        out.push(wide ? buf.readUInt16BE(at) & 0x7fff : buf[at]! & 0x7f);
      }
      return out;
    }
    pos += n * step;
  }
  return [];
}
