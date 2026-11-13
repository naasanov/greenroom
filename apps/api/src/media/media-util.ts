import { Readable } from "node:stream";
import type { Response } from "express";
import type { DriveDownloadResult } from "../integrations/index.js";
import type { MediaItem } from "@greenroom/shared";
import type { mediaItems } from "@greenroom/db";
import { apiPublicUrl } from "../auth/auth.constants.js";

export type MediaItemRow = typeof mediaItems.$inferSelect;

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export function toItemDto(row: MediaItemRow): MediaItem {
  const base = `${apiPublicUrl()}/bands/${row.bandId}/media/${row.id}`;
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    missing: row.missing,
    songId: row.songId,
    createdAt: row.createdAt.toISOString(),
    thumbnailUrl: row.thumbnailUrl && !row.missing ? `${base}/thumbnail` : null,
    contentUrl: `${base}/content`,
  };
}

export const driveFolderUrl = (folderId: string): string =>
  `https://drive.google.com/drive/folders/${folderId}`;

export const bandPhotoUrl = (bandId: string, fileId: string): string =>
  `${apiPublicUrl()}/bands/${bandId}/photo?v=${encodeURIComponent(fileId)}`;

export const memberPhotoUrl = (
  bandId: string,
  userId: string,
  fileId: string | null,
): string | null =>
  fileId
    ? `${apiPublicUrl()}/bands/${bandId}/members/${userId}/photo?v=${encodeURIComponent(fileId)}`
    : null;

export const userPhotoUrl = (userId: string, version: number): string =>
  `${apiPublicUrl()}/users/${userId}/photo?v=${version}`;

export function mediaCategory(
  mime: string | null,
): "photos" | "videos" | "other" {
  if (mime?.startsWith("image/")) return "photos";
  if (mime?.startsWith("video/")) return "videos";
  return "other";
}

/** Types that are safe to render inline from the API origin. */
export function inlineSafe(mime: string): boolean {
  if (mime === "image/svg+xml") return false;
  return (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    mime === "application/pdf"
  );
}

export function sniffImageMime(buf: Buffer): string {
  if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF") return "image/webp";
  if (buf.subarray(0, 2).toString("latin1") === "\xff\xd8") return "image/jpeg";
  if (buf.toString("utf8", 0, 200).includes("<svg")) return "image/svg+xml";
  return "image/jpeg";
}

export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

export function contentDisposition(
  kind: "inline" | "attachment",
  name: string,
): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function sendStream(
  res: Response,
  stream: Readable,
  headers: Record<string, string | number>,
): void {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader("X-Content-Type-Options", "nosniff");
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses a single-range `Range` header. Returns null when absent, malformed,
 * multi-range, or a suffix range without a known size (served as a full 200).
 */
export function parseRange(
  header: string | undefined,
  size: number | null,
): { start: number; end?: number } | "unsatisfiable" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    if (size === null) return null;
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(size - n, 0), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? undefined : Number(m[2]);
  if (end !== undefined && end < start) return null;
  if (size !== null && start >= size) return "unsatisfiable";
  return { start, end };
}

export type OkDownload = Extract<DriveDownloadResult, { status: "ok" }>;

const PRIVATE_CACHE = "private, max-age=60";
// Thumbnails are served through the authenticated API, never signed URLs.
const THUMBNAIL_CACHE = "private, max-age=3600";

export async function sendThumbnail(
  res: Response,
  result: OkDownload,
): Promise<void> {
  const buf = await readAll(result.stream);
  sendStream(res, Readable.from([buf]), {
    "Content-Type": sniffImageMime(buf),
    "Content-Length": buf.length,
    "Cache-Control": THUMBNAIL_CACHE,
  });
}

export function sendUnsatisfiable(res: Response, size: number | null): void {
  res
    .status(416)
    .setHeader("Content-Range", `bytes */${size ?? 0}`)
    .end();
}

/** Streams file content, as 206 when the download is a partial range. */
export function sendContent(
  res: Response,
  result: OkDownload,
  file: { mimeType: string | null; name: string; download: boolean },
): void {
  const mime = result.mimeType ?? file.mimeType ?? "application/octet-stream";
  const attachment = file.download || !inlineSafe(mime);
  const partial = result.partial;
  if (partial) {
    res.status(206);
    res.setHeader(
      "Content-Range",
      `bytes ${partial.start}-${partial.end}/${partial.total}`,
    );
  }
  sendStream(res, result.stream, {
    "Content-Type": mime,
    "Content-Length": partial ? partial.end - partial.start + 1 : result.size,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(
      attachment ? "attachment" : "inline",
      result.mimeType ? result.name : file.name,
    ),
    "Cache-Control": PRIVATE_CACHE,
  });
}
