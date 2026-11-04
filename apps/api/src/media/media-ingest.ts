import { eq, sql } from "drizzle-orm";
import { mediaFolders, mediaItems, type Database } from "@greenroom/db";
import type { DriveFile } from "../integrations/index.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MediaItemRow = typeof mediaItems.$inferSelect;
export type MediaFolderRow = typeof mediaFolders.$inferSelect;

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
      mimeType: f.mimeType,
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
        // A rename seen in Drive stops song-title auto-renames.
        nameCustomized: existing
          ? existing.nameCustomized || existing.name !== f.name
          : false,
        mimeType: f.mimeType,
        sizeBytes: f.size,
        thumbnailUrl: f.thumbnailLink,
        missing: false,
        trashedAt: null,
        deletedAt: null,
        updatedAt: now,
      },
    });
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
