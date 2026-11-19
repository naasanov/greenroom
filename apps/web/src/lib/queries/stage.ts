import { z } from "zod";
import type {
  ChordsIndex,
  Gig,
  GigSetlist,
  SongChordSheet,
  SongDetail,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { fetchChordSheets } from "@/lib/queries/chords";

const typed = <T>() => z.custom<T>();

export interface StageSong {
  id: string;
  title: string;
  notes: string | null;
  artist?: string | null;
  durationSeconds?: number | null;
}

/** Everything stage mode renders for one gig, stored per device for offline use. */
export interface StageSnapshot {
  gigId: string;
  bandId: string;
  setlistId: string;
  gigTitle: string;
  savedAt: number;
  songs: StageSong[];
  /** Chord sheets by song id; absent when chords are off, failed to load, or predate this field. */
  chords?: Record<string, SongChordSheet>;
}

/** Sheets for the given songs: empty when chords are off, undefined when the index or sheets fail to load. */
async function fetchChordsFor(
  bandId: string,
  songIds: string[],
  indexPromise?: Promise<ChordsIndex | undefined>,
): Promise<Record<string, SongChordSheet> | undefined> {
  try {
    const index = await (indexPromise ?? fetchChordsIndex(bandId));
    if (!index) return undefined;
    if (!index.enabled) return {};
    const have = new Set(index.songIds);
    const ids = [...new Set(songIds)].filter((id) => have.has(id));
    const sheets = await fetchChordSheets(bandId, ids);
    return Object.fromEntries(sheets.map((s) => [s.songId, s]));
  } catch {
    return undefined;
  }
}

/** Fetches the band's chords index once for reuse across gigs; undefined on failure. */
export function fetchChordsIndex(
  bandId: string,
): Promise<ChordsIndex | undefined> {
  return api(`/bands/${bandId}/chords`, { schema: typed<ChordsIndex>() }).catch(
    () => undefined,
  );
}

/** Fetches a gig's setlist plus each song's notes. Empty setlists yield null. */
export async function fetchStageSnapshot(
  bandId: string,
  gigId: string,
  opts: {
    gigTitle?: string;
    songCache?: Map<string, Promise<SongDetail>>;
    chordsIndex?: Promise<ChordsIndex | undefined>;
  } = {},
): Promise<StageSnapshot | null> {
  const songCache = opts.songCache ?? new Map<string, Promise<SongDetail>>();
  const [setlist, gig] = await Promise.all([
    api(`/bands/${bandId}/gigs/${gigId}/setlist`, {
      schema: typed<GigSetlist>(),
    }),
    opts.gigTitle
      ? Promise.resolve({ title: opts.gigTitle })
      : api(`/bands/${bandId}/gigs/${gigId}`, { schema: typed<Gig>() }),
  ]);
  if (setlist.items.length === 0) return null;
  const chordsPromise = fetchChordsFor(
    bandId,
    setlist.items.map((i) => i.songId),
    opts.chordsIndex,
  );
  const songs = await Promise.all(
    setlist.items.map(async (item) => {
      let detail = songCache.get(item.songId);
      if (!detail) {
        detail = api(`/bands/${bandId}/songs/${item.songId}`, {
          schema: typed<SongDetail>(),
        });
        songCache.set(item.songId, detail);
      }
      const d = await detail;
      return {
        id: item.songId,
        title: item.title,
        notes: d.notes,
        artist: d.artist,
        durationSeconds: d.durationSeconds,
      };
    }),
  );
  return {
    gigId,
    bandId,
    setlistId: setlist.id,
    gigTitle: gig.title,
    savedAt: Date.now(),
    songs,
    chords: await chordsPromise,
  };
}

/** Resolves a gig's band id from its deep link (works for any band the user is in). */
export async function fetchGigBandId(gigId: string): Promise<string> {
  const link = await api(`/links/gigs/${encodeURIComponent(gigId)}`, {
    schema: typed<{ bandId: string }>(),
  });
  return link.bandId;
}
