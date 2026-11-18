import { z } from "zod";

export const SONG_ERROR_CODES = {
  duplicateSong: "DUPLICATE_SONG",
  playlistNotFound: "PLAYLIST_NOT_FOUND_OR_PRIVATE",
  playlistForbidden: "PLAYLIST_FORBIDDEN",
  spotifyLoginRequired: "SPOTIFY_LOGIN_REQUIRED",
  spotifyReconnectRequired: "SPOTIFY_RECONNECT_REQUIRED",
  nothingToExport: "NOTHING_TO_EXPORT",
} as const;

/** Trims, and maps an empty string to null so cleared fields store null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable();

export const referenceInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(2000),
});
export type ReferenceInput = z.infer<typeof referenceInputSchema>;

export const referenceSchema = referenceInputSchema.extend({
  id: z.string().uuid(),
  position: z.number().int(),
});
export type Reference = z.infer<typeof referenceSchema>;

const songFields = {
  title: z.string().trim().min(1).max(300),
  artist: optionalText(300),
  durationSeconds: z.number().int().min(0).max(86_400).nullable(),
  notes: optionalText(10_000),
  imageUrl: optionalText(2048),
  spotifyTrackId: optionalText(64),
  youtubeUrl: optionalText(2048),
};

export const createSongSchema = z.object({
  title: songFields.title,
  artist: songFields.artist.optional(),
  durationSeconds: songFields.durationSeconds.optional(),
  notes: songFields.notes.optional(),
  imageUrl: songFields.imageUrl.optional(),
  spotifyTrackId: songFields.spotifyTrackId.optional(),
  youtubeUrl: songFields.youtubeUrl.optional(),
  references: z.array(referenceInputSchema).max(50).optional(),
  /** Skips the duplicate check. */
  force: z.boolean().optional(),
});
export type CreateSong = z.infer<typeof createSongSchema>;

export const updateSongSchema = z.object({
  title: songFields.title.optional(),
  artist: songFields.artist.optional(),
  durationSeconds: songFields.durationSeconds.optional(),
  notes: songFields.notes.optional(),
  imageUrl: songFields.imageUrl.optional(),
  spotifyTrackId: songFields.spotifyTrackId.optional(),
  youtubeUrl: songFields.youtubeUrl.optional(),
  /** When present, replaces every reference row, in this order. */
  references: z.array(referenceInputSchema).max(50).optional(),
});
export type UpdateSong = z.infer<typeof updateSongSchema>;

export const SONG_SORTS = [
  "recent",
  "title",
  "artist",
  "lastPlayed",
  "mostPlayed",
] as const;
export const songSortSchema = z.enum(SONG_SORTS);
export type SongSort = z.infer<typeof songSortSchema>;

export const listSongsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  sort: songSortSchema.optional(),
});
export type ListSongsQuery = z.infer<typeof listSongsQuerySchema>;

export interface SongSummary {
  id: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  imageUrl: string | null;
  spotifyTrackId: string | null;
  youtubeUrl: string | null;
  createdAt: string;
  /** Distinct setlists containing the song. */
  setlistCount: number;
  /** Date (YYYY-MM-DD) of the latest gig, on or before today, whose setlist has the song. */
  lastPlayedDate: string | null;
}

export type UsedIn =
  | {
      kind: "gig";
      setlistId: string;
      gigId: string;
      title: string;
      date: string;
    }
  | {
      kind: "practice";
      setlistId: string;
      seriesId: string;
      title: string;
      effectiveFrom: string;
    };

export interface SongDetail extends SongSummary {
  bandId: string;
  notes: string | null;
  updatedAt: string;
  references: Reference[];
  usedIn: UsedIn[];
}

/** A reference tag used in the band's songs, with how many songs use it. */
export interface ReferenceTag {
  label: string;
  count: number;
}

export type SongCreated = SongDetail;

export interface DeletedSong {
  id: string;
  setlistCount: number;
}

export const resolveSongSchema = z.object({
  input: z.string().trim().min(1).max(2048),
});
export type ResolveSong = z.infer<typeof resolveSongSchema>;

export interface SongCandidate {
  source: "spotify" | "youtube";
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  imageUrl: string | null;
  spotifyTrackId: string | null;
  youtubeUrl: string | null;
  /** Rows to prefill, e.g. the source link. */
  references: ReferenceInput[];
  /** Id of a library song that would be a duplicate, if any. */
  existingSongId: string | null;
}

export interface ResolveResult {
  /** How the input was interpreted. `playlist` means use the import flow instead. */
  kind: "spotify-link" | "youtube-link" | "search" | "playlist";
  candidates: SongCandidate[];
}

/**
 * The "magic" reference keys, in tie-break order. `musiclink` is the MusicLink
 * platform key and `hosts` the only hosts a value may use; adding a provider
 * is one more entry.
 */
export const SUGGESTIBLE_REFERENCES = [
  {
    key: "spotify",
    label: "Spotify",
    musiclink: "spotify",
    hosts: ["open.spotify.com", "spotify.link"],
  },
  {
    key: "youtubeMusic",
    label: "YouTube Music",
    musiclink: "youtube_music",
    hosts: ["music.youtube.com"],
  },
  {
    key: "youtube",
    label: "YouTube",
    musiclink: "youtube",
    hosts: ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"],
  },
  {
    key: "appleMusic",
    label: "Apple Music",
    musiclink: "apple_music",
    hosts: ["music.apple.com"],
  },
] as const;
export type SuggestibleKey = (typeof SUGGESTIBLE_REFERENCES)[number]["key"];
export type MagicReference = (typeof SUGGESTIBLE_REFERENCES)[number];

/** The magic key whose label equals `label` (trimmed, case-insensitive). */
export function findMagicReference(label: string): MagicReference | undefined {
  const l = label.trim().toLowerCase();
  return SUGGESTIBLE_REFERENCES.find((r) => r.label.toLowerCase() === l);
}

/** True for an https link on one of the magic key's hosts. */
export function validateMagicReferenceValue(
  entry: MagicReference,
  value: string,
): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      (entry.hosts as readonly string[]).includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** Hosts whose links may seed a suggestion lookup; anything else is never sent on. */
export const SUGGESTION_SOURCE_HOSTS = [
  "open.spotify.com",
  "music.youtube.com",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "music.apple.com",
] as const;

/** True for https links on an allowed streaming host. */
export function isSuggestionSourceUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      (SUGGESTION_SOURCE_HOSTS as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export const suggestReferencesSchema = z.object({
  title: z.string().trim().max(300).optional(),
  artist: z.string().trim().max(300).optional(),
  /** A streaming link to the song; MusicLink resolves the others from it. */
  sourceUrl: z.string().trim().max(2048).optional(),
});
export type SuggestReferences = z.infer<typeof suggestReferencesSchema>;

export interface ReferenceSuggestion {
  key: SuggestibleKey;
  label: string;
  value: string;
}

export const importPlaylistSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});
export type ImportPlaylist = z.infer<typeof importPlaylistSchema>;

export type ImportStatus = "queued" | "running" | "completed" | "failed";

export interface ImportProgress {
  importId: string;
  status: ImportStatus;
  playlistName: string | null;
  total: number;
  done: number;
  added: number;
  /** Already in the library (or repeated in the playlist). */
  skipped: number;
  failed: number;
  /** Set once the import ends: failed imports carry a message. */
  error: string | null;
}

export const exportSetlistSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type ExportSetlist = z.infer<typeof exportSetlistSchema>;

/** Library exports follow the given sort (default: recently added). */
export const exportLibrarySchema = exportSetlistSchema.extend({
  sort: songSortSchema.optional(),
});
export type ExportLibrary = z.infer<typeof exportLibrarySchema>;

export interface ExportResult {
  playlistId: string;
  playlistUrl: string;
  name: string;
  exported: number;
  /** Songs without a Spotify track, in export order. */
  skipped: { songId: string; title: string }[];
}
