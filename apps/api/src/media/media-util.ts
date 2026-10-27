import { Readable } from "node:stream";
import type { Response } from "express";
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
