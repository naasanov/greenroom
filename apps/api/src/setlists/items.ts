import { BadRequestException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { setlistItems, setlists, songs, type Database } from "@greenroom/db";
import {
  SETLIST_ERROR_CODES,
  type SetlistDetail,
  type SetlistItem,
} from "@greenroom/shared";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

/** Live (non-deleted) songs of a setlist in order; soft-deleted songs keep their rows but are hidden. */
export async function liveItems(
  db: Db,
  setlistId: string,
): Promise<SetlistItem[]> {
  const rows = await db
    .select({
      itemId: setlistItems.id,
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      durationSeconds: songs.durationSeconds,
      imageUrl: songs.imageUrl,
    })
    .from(setlistItems)
    .innerJoin(songs, eq(songs.id, setlistItems.songId))
    .where(and(eq(setlistItems.setlistId, setlistId), isNull(songs.deletedAt)))
    .orderBy(asc(setlistItems.position), asc(setlistItems.id));
  return rows.map((r, position) => ({ ...r, position }));
}

export async function readSetlist(
  db: Db,
  bandId: string,
  setlistId: string,
): Promise<SetlistDetail | null> {
  const [sl] = await db
    .select({ id: setlists.id })
    .from(setlists)
    .where(and(eq(setlists.id, setlistId), eq(setlists.bandId, bandId)));
  if (!sl) return null;
  const items = await liveItems(db, setlistId);
  return {
    id: setlistId,
    bandId,
    items,
    songCount: items.length,
    totalDurationSeconds: items.reduce(
      (sum, i) => sum + (i.durationSeconds ?? 0),
      0,
    ),
    unknownDurationCount: items.filter((i) => i.durationSeconds === null)
      .length,
  };
}

/** Throws 400 unless every id is a live song of the band. */
export async function assertBandSongs(
  db: Db,
  bandId: string,
  songIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(songIds)];
  if (unique.length === 0) return;
  const found = await db
    .select({ id: songs.id })
    .from(songs)
    .where(
      and(
        inArray(songs.id, unique),
        eq(songs.bandId, bandId),
        isNull(songs.deletedAt),
      ),
    );
  const ok = new Set(found.map((f) => f.id));
  const missing = unique.filter((id) => !ok.has(id));
  if (missing.length > 0) {
    throw new BadRequestException({
      code: SETLIST_ERROR_CODES.songNotFound,
      message: "Some songs are not in this band's library",
      songIds: missing,
    });
  }
}

/** Locks the setlist row so concurrent edits serialize. */
export async function lockSetlist(tx: Tx, setlistId: string): Promise<void> {
  await tx
    .select({ id: setlists.id })
    .from(setlists)
    .where(eq(setlists.id, setlistId))
    .for("update");
}

async function touch(tx: Tx, setlistId: string): Promise<void> {
  await tx
    .update(setlists)
    .set({ updatedAt: new Date() })
    .where(eq(setlists.id, setlistId));
}

/** Replaces every row (hidden soft-deleted ones included) with the given order. */
export async function replaceItems(
  tx: Tx,
  setlistId: string,
  songIds: readonly string[],
): Promise<void> {
  await tx.delete(setlistItems).where(eq(setlistItems.setlistId, setlistId));
  if (songIds.length > 0) {
    await tx
      .insert(setlistItems)
      .values(
        songIds.map((songId, position) => ({ setlistId, songId, position })),
      );
  }
  await touch(tx, setlistId);
}

/** Appends songs that are not already live in the setlist. */
export async function appendSongs(
  tx: Tx,
  setlistId: string,
  songIds: readonly string[],
): Promise<void> {
  const present = new Set(
    (await liveItems(tx, setlistId)).map((i) => i.songId),
  );
  const toAdd = songIds.filter(
    (id, i) => !present.has(id) && songIds.indexOf(id) === i,
  );
  if (toAdd.length > 0) {
    const [{ next } = { next: 0 }] = await tx
      .select({
        next: sql<number>`coalesce(max(${setlistItems.position}), -1) + 1`.mapWith(
          Number,
        ),
      })
      .from(setlistItems)
      .where(eq(setlistItems.setlistId, setlistId));
    await tx
      .insert(setlistItems)
      .values(
        toAdd.map((songId, i) => ({ setlistId, songId, position: next + i })),
      );
    await touch(tx, setlistId);
  }
}

/** Copies the live songs of `sourceId` into `targetId`. */
export async function copyItems(
  tx: Tx,
  sourceId: string,
  targetId: string,
  mode: "replace" | "append",
): Promise<void> {
  const ids = (await liveItems(tx, sourceId)).map((i) => i.songId);
  if (mode === "replace") await replaceItems(tx, targetId, ids);
  else await appendSongs(tx, targetId, ids);
}
