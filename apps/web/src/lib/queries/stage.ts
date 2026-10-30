import { z } from "zod";
import type { Gig, GigSetlist, SongDetail } from "@greenroom/shared";
import { api } from "@/lib/api";

const typed = <T>() => z.custom<T>();

export interface StageSong {
  id: string;
  title: string;
  notes: string | null;
}

/** Everything stage mode renders for one gig, stored per device for offline use. */
export interface StageSnapshot {
  gigId: string;
  bandId: string;
  setlistId: string;
  gigTitle: string;
  savedAt: number;
  songs: StageSong[];
}

/** Fetches a gig's setlist plus each song's notes. Empty setlists yield null. */
export async function fetchStageSnapshot(
  bandId: string,
  gigId: string,
  opts: {
    gigTitle?: string;
    songCache?: Map<string, Promise<SongDetail>>;
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
      return { id: item.songId, title: item.title, notes: d.notes };
    }),
  );
  return {
    gigId,
    bandId,
    setlistId: setlist.id,
    gigTitle: gig.title,
    savedAt: Date.now(),
    songs,
  };
}

/** Resolves a gig's band id from its deep link (works for any band the user is in). */
export async function fetchGigBandId(gigId: string): Promise<string> {
  const link = await api(`/links/gigs/${encodeURIComponent(gigId)}`, {
    schema: typed<{ bandId: string }>(),
  });
  return link.bandId;
}
