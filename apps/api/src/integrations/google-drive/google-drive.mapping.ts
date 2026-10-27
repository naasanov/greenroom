import type { drive_v3 } from "googleapis";
import type { DriveFile } from "./google-drive.adapter.js";

export const DRIVE_FILE_FIELDS =
  "id,name,mimeType,parents,trashed,size,modifiedTime,createdTime,md5Checksum,thumbnailLink";

/** Maps a Drive API file resource (requested with DRIVE_FILE_FIELDS) to DriveFile. */
export function mapDriveFile(raw: drive_v3.Schema$File): DriveFile {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    mimeType: raw.mimeType ?? "application/octet-stream",
    parentId: raw.parents?.[0] ?? null,
    trashed: raw.trashed ?? false,
    size: Number(raw.size ?? 0),
    modifiedTime: raw.modifiedTime ?? "",
    createdTime: raw.createdTime ?? "",
    md5Checksum: raw.md5Checksum ?? null,
    thumbnailLink: raw.thumbnailLink ?? null,
  };
}

/** Bytes received according to a 308 `Range: bytes=0-N` header; 0 when absent. */
export function parseReceivedBytes(range: string | null | undefined): number {
  const m = /^bytes=0-(\d+)$/.exec((range ?? "").trim());
  return m?.[1] ? Number(m[1]) + 1 : 0;
}

/** Content-Range value for a chunk; an empty chunk queries or finalizes by total. */
export function chunkContentRange(
  start: number,
  end: number,
  total: number,
): string {
  return end < start ? `bytes */${total}` : `bytes ${start}-${end}/${total}`;
}

/** Rewrites a Drive thumbnailLink size suffix (`=s220`) to the requested size. */
export function thumbnailUrl(link: string, size = 400): string {
  return `${link.replace(/=[sw]\d+(-[a-z0-9-]+)?$/i, "")}=s${size}`;
}

/** Drive query literal escaping for single-quoted strings. */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
