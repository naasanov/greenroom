import { and, eq, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { driveFileSongLinks, type Database } from "@greenroom/db";
import type { DriveFile } from "../integrations/index.js";
import { FOLDER_MIME } from "./media-util.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const INSERT_CHUNK = 500;

/** Takes the band's Drive poll lock until the transaction ends, waiting if held. */
export async function lockDrivePoll(tx: Tx, bandId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${drivePollLockKey(bandId)}, 0))`,
  );
}

export const drivePollLockKey = (bandId: string): string =>
  `drive-poll:${bandId}`;

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
  const rows = songIds.flatMap((songId) =>
    live.map((f) => ({
      bandId,
      songId,
      driveFileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: false,
      sourceFolderId: folderId,
    })),
  );
  // Chunked to stay under Postgres's 65,535 bind-parameter limit per statement.
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await tx
      .insert(driveFileSongLinks)
      .values(rows.slice(i, i + INSERT_CHUNK))
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
