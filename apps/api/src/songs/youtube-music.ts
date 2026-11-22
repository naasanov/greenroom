import { asc, inArray } from "drizzle-orm";
import { songLinks, type Database } from "@greenroom/db";
import { youtubeMusicReferenceUrl } from "@greenroom/shared";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Each song's "YouTube Music" reference value, keyed by song id; songs without one are absent. */
export async function youtubeMusicUrls(
  db: Database | Tx,
  songIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (songIds.length === 0) return out;
  const rows = await db
    .select({
      songId: songLinks.songId,
      label: songLinks.label,
      value: songLinks.value,
    })
    .from(songLinks)
    .where(inArray(songLinks.songId, songIds))
    .orderBy(asc(songLinks.position), asc(songLinks.id));
  const bySong = new Map<string, { label: string; value: string }[]>();
  for (const r of rows) {
    const list = bySong.get(r.songId) ?? [];
    list.push(r);
    bySong.set(r.songId, list);
  }
  for (const [songId, refs] of bySong) {
    const url = youtubeMusicReferenceUrl(refs);
    if (url) out.set(songId, url);
  }
  return out;
}
