import { and, eq, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { driveFileSongLinks, type Database } from "@greenroom/db";
import type { DriveFile } from "../integrations/index.js";
import { FOLDER_MIME } from "./media-util.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Attaches top-level files of a song-linked folder to each song, tagged with
 * the folder id. Idempotent on band + song + file; an existing manual link
 * (null source) is left untouched and an auto link only refreshes its snapshot.
 */
export async function attachFolderFiles(
  tx: Tx,
  bandId: string,
  folderId: string,
  songIds: string[],
  files: DriveFile[],
): Promise<void> {
  const live = files.filter((f) => f.mimeType !== FOLDER_MIME && !f.trashed);
  if (!live.length || !songIds.length) return;
  await tx
    .insert(driveFileSongLinks)
    .values(
      songIds.flatMap((songId) =>
        live.map((f) => ({
          bandId,
          songId,
          driveFileId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          isFolder: false,
          sourceFolderId: folderId,
        })),
      ),
    )
    .onConflictDoUpdate({
      target: [
        driveFileSongLinks.bandId,
        driveFileSongLinks.songId,
        driveFileSongLinks.driveFileId,
      ],
      set: {
        name: sql`excluded.name`,
        mimeType: sql`excluded.mime_type`,
      },
      setWhere: isNotNull(driveFileSongLinks.sourceFolderId),
    });
}

/** Deletes links a folder created; `keepSongIds` are songs that stay linked to it. */
export async function detachFolderFiles(
  tx: Tx,
  bandId: string,
  folderId: string,
  keepSongIds: string[] = [],
): Promise<void> {
  const mine = and(
    eq(driveFileSongLinks.bandId, bandId),
    eq(driveFileSongLinks.sourceFolderId, folderId),
  );
  await tx
    .delete(driveFileSongLinks)
    .where(
      keepSongIds.length
        ? and(mine, notInArray(driveFileSongLinks.songId, keepSongIds))
        : mine,
    );
}

/** Drops a file's auto links whose source folder is no longer its parent. */
export async function detachMovedFile(
  tx: Tx,
  bandId: string,
  file: DriveFile,
): Promise<void> {
  const stale = and(
    eq(driveFileSongLinks.bandId, bandId),
    eq(driveFileSongLinks.driveFileId, file.id),
    isNotNull(driveFileSongLinks.sourceFolderId),
  );
  await tx
    .delete(driveFileSongLinks)
    .where(
      file.parentId
        ? and(stale, ne(driveFileSongLinks.sourceFolderId, file.parentId))
        : stale,
    );
}
