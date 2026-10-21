import type { SongSort } from "@greenroom/shared";
import { songSortSchema } from "@greenroom/shared";

export const SORT_LABELS: Record<SongSort, string> = {
  recent: "Recently added",
  title: "Title A-Z",
  artist: "Artist A-Z",
  lastPlayed: "Last played",
  mostPlayed: "Most played",
};

const SORT_KEY = "greenroom:library-sort";

/** Reads the per-device sort; storage can be blocked, so failures fall back. */
export function loadSort(): SongSort {
  try {
    const parsed = songSortSchema.safeParse(localStorage.getItem(SORT_KEY));
    if (parsed.success) return parsed.data;
  } catch {
    // Storage unavailable: use the default.
  }
  return "recent";
}

export function saveSort(sort: SongSort): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Parses "m:ss" or "h:mm:ss"; empty is null, anything else is undefined. */
export function parseDuration(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(t);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Spotify art first, then the YouTube thumbnail, else nothing. */
export function songArt(song: {
  imageUrl: string | null;
  youtubeUrl: string | null;
}): string | null {
  if (song.imageUrl) return song.imageUrl;
  const id = song.youtubeUrl
    ? (/[?&]v=([\w-]{6,})/.exec(song.youtubeUrl)?.[1] ??
      /youtu\.be\/([\w-]{6,})/.exec(song.youtubeUrl)?.[1])
    : null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export interface SongFormValues {
  title: string;
  artist: string;
  duration: string;
  notes: string;
  references: { id: string; label: string; value: string }[];
}

/** Maps form values to the API body; blank reference rows are dropped. */
export function toSongBody(values: SongFormValues) {
  return {
    title: values.title.trim(),
    artist: values.artist.trim() || null,
    durationSeconds: parseDuration(values.duration) ?? null,
    notes: values.notes.trim() || null,
    references: values.references
      .filter((r) => r.value.trim())
      .map((r) => ({
        label: r.label.trim() || hostOf(r.value) || "Link",
        value: r.value.trim(),
      })),
  };
}

function hostOf(value: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      .hostname;
  } catch {
    return null;
  }
}
