import { asc, inArray } from "drizzle-orm";
import { songLinks, type Database } from "@greenroom/db";
import {
  deriveSpotifyTrackId,
  deriveYoutubeUrl,
  youtubeMusicReferenceUrl,
} from "@greenroom/shared";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The streaming links a song exposes, derived from its reference rows. */
export interface ReferenceLinks {
  spotifyTrackId: string | null;
  youtubeUrl: string | null;
  youtubeMusicUrl: string | null;
}

/** The stored columns used only when a song has no matching reference row. */
export interface LinkColumns {
  id: string;
  spotifyTrackId: string | null;
  youtubeUrl: string | null;
}

/** Reference rows win; the stored columns fill in when the row is absent. */
export function linksFromReferences(
  refs: readonly { label: string; value: string }[],
  columns: Pick<LinkColumns, "spotifyTrackId" | "youtubeUrl">,
): ReferenceLinks {
  return {
    spotifyTrackId: deriveSpotifyTrackId(refs, columns.spotifyTrackId),
    youtubeUrl: deriveYoutubeUrl(refs, columns.youtubeUrl),
    youtubeMusicUrl: youtubeMusicReferenceUrl(refs),
  };
}

/** Every song's derived links, keyed by song id (songs without references fall back to their columns). */
export async function referenceLinks(
  db: Database | Tx,
  songRows: readonly LinkColumns[],
): Promise<Map<string, ReferenceLinks>> {
  const out = new Map<string, ReferenceLinks>();
  if (songRows.length === 0) return out;
  const rows = await db
    .select({
      songId: songLinks.songId,
      label: songLinks.label,
      value: songLinks.value,
    })
    .from(songLinks)
    .where(
      inArray(
        songLinks.songId,
        songRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(songLinks.position), asc(songLinks.id));
  const bySong = new Map<string, { label: string; value: string }[]>();
  for (const r of rows) {
    const list = bySong.get(r.songId) ?? [];
    list.push(r);
    bySong.set(r.songId, list);
  }
  for (const s of songRows) {
    out.set(s.id, linksFromReferences(bySong.get(s.id) ?? [], s));
  }
  return out;
}
