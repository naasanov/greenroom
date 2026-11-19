import { and, eq, sql } from "drizzle-orm";
import { mediaFolders, mediaItems, type Database } from "@greenroom/db";
import type { DriveFile } from "../integrations/index.js";
import { heicMime, isHeic, jpegName } from "./heic-util.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MediaItemRow = typeof mediaItems.$inferSelect;
export type MediaFolderRow = typeof mediaFolders.$inferSelect;

/** True when `f` is the JPEG that replaced the item's HEIC file (same stem, `.jpg`). */
function convertedFromHeic(existing: MediaItemRow, f: DriveFile): boolean {
  if (f.mimeType !== "image/jpeg") return false;
  if (!isHeic(existing.mimeType, existing.name)) return false;
  const stem = jpegName(existing.name).replace(/\.jpg$/, "");
  return f.name === `${stem}.jpg` || f.name.startsWith(`${stem} (`);
}

/**
 * Inserts or refreshes the media item for a Drive file (idempotent on band +
 * drive file id). `existing` is the current row, if any, for rename tracking.
 */
export async function upsertDriveItem(
  tx: Tx,
  bandId: string,
  target: { gigId: string; folderId: string | null },
  f: DriveFile,
  existing: MediaItemRow | undefined,
): Promise<void> {
  const now = new Date();
  await tx
    .insert(mediaItems)
    .values({
      bandId,
      gigId: target.gigId,
      folderId: target.folderId,
      driveFileId: f.id,
      name: f.name,
      mimeType: heicMime(f.mimeType, f.name),
      sizeBytes: f.size,
      thumbnailUrl: f.thumbnailLink,
      createdAt: new Date(f.createdTime),
    })
    .onConflictDoUpdate({
      target: [mediaItems.bandId, mediaItems.driveFileId],
      set: {
        gigId: target.gigId,
        folderId: target.folderId,
        name: f.name,
        // A rename seen in Drive stops song-title auto-renames, except the HEIC to JPEG one.
        nameCustomized: existing
          ? existing.nameCustomized ||
            (existing.name !== f.name && !convertedFromHeic(existing, f))
          : false,
        mimeType: heicMime(f.mimeType, f.name),
        sizeBytes: f.size,
        thumbnailUrl: f.thumbnailLink,
        missing: false,
        trashedAt: null,
        deletedAt: null,
        updatedAt: now,
      },
    });
}

/** Points the item at the JPEG that replaced its HEIC file. */
export async function applyConvertedFile(
  db: Database,
  bandId: string,
  f: DriveFile,
): Promise<void> {
  await db
    .update(mediaItems)
    .set({
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.size,
      thumbnailUrl: f.thumbnailLink,
      updatedAt: new Date(),
    })
    .where(
      and(eq(mediaItems.bandId, bandId), eq(mediaItems.driveFileId, f.id)),
    );
}

/** Inserts the gig's media_folders row for a Drive subfolder; null when it already exists. */
export async function insertSubfolder(
  tx: Tx,
  bandId: string,
  gigId: string,
  f: DriveFile,
): Promise<MediaFolderRow | null> {
  const [{ next }] = await tx
    .select({
      next: sql<number>`coalesce(max(${mediaFolders.position}), -1) + 1`,
    })
    .from(mediaFolders)
    .where(eq(mediaFolders.gigId, gigId));
  const [row] = await tx
    .insert(mediaFolders)
    .values({
      bandId,
      gigId,
      name: f.name,
      driveFolderId: f.id,
      position: Number(next),
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}
