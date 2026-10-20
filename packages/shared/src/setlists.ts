import { z } from "zod";
import { ASSIGNMENT_SCOPES } from "./events.js";
import { createSongSchema, type SongCreated } from "./songs.js";

export const SETLIST_ERROR_CODES = {
  songNotFound: "SONG_NOT_FOUND",
  duplicateSongInSetlist: "DUPLICATE_SONG_IN_SETLIST",
  noPreviousLineup: "NO_PREVIOUS_LINEUP",
  invalidMembership: "INVALID_MEMBERSHIP",
} as const;

// ---- setlists ----

export interface SetlistItem {
  itemId: string;
  position: number;
  songId: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  imageUrl: string | null;
}

export interface SetlistDetail {
  id: string;
  bandId: string;
  items: SetlistItem[];
  songCount: number;
  /** Sum of the known durations. */
  totalDurationSeconds: number;
  /** Songs whose duration is unknown (not part of the total). */
  unknownDurationCount: number;
}

export interface GigSetlist extends SetlistDetail {
  gigId: string;
}

/** The full ordered list of song ids; each song appears at most once. */
export const replaceSetlistItemsSchema = z.object({
  songIds: z.array(z.string().uuid()).max(500),
});
export type ReplaceSetlistItems = z.infer<typeof replaceSetlistItemsSchema>;

export const appendSetlistSongSchema = z.object({ songId: z.string().uuid() });
export type AppendSetlistSong = z.infer<typeof appendSetlistSongSchema>;

export const COPY_MODES = ["replace", "append"] as const;
export const copySetlistSchema = z.object({
  sourceSetlistId: z.string().uuid(),
  mode: z.enum(COPY_MODES).default("replace"),
});
export type CopySetlist = z.infer<typeof copySetlistSchema>;

/** Same body and duplicate rules as creating a song. */
export const addSongToSetlistSchema = createSongSchema;
export type AddSongToSetlist = z.infer<typeof addSongToSetlistSchema>;

export interface SongAddedToSetlist {
  song: SongCreated;
  setlist: SetlistDetail;
}

export const gigHistoryQuerySchema = z.object({
  /** Case-insensitive match on gig title or venue name. */
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type GigHistoryQuery = z.infer<typeof gigHistoryQuerySchema>;

export interface GigHistoryEntry {
  gigId: string;
  title: string;
  venueName: string | null;
  date: string;
  setlistId: string;
  songCount: number;
}

// ---- practice setlists ----

export const createPracticeSetlistSchema = z.object({
  scope: z.enum(ASSIGNMENT_SCOPES),
  onConflict: z.enum(["replace", "keep"]).default("replace"),
  /** Start the new setlist with a copy of this setlist's songs. */
  sourceSetlistId: z.string().uuid().optional(),
  /** Start with a copy of the setlist currently in force (ignored when sourceSetlistId is set). */
  copyCurrent: z.boolean().default(false),
});
export type CreatePracticeSetlist = z.infer<typeof createPracticeSetlistSchema>;

export const clearPracticeSetlistQuerySchema = z.object({
  scope: z.enum(ASSIGNMENT_SCOPES),
  onConflict: z.enum(["replace", "keep"]).default("replace"),
});
export type ClearPracticeSetlistQuery = z.infer<
  typeof clearPracticeSetlistQuerySchema
>;

// ---- lineup ----

export interface LineupMember {
  membershipId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when the person has since left the band (kept for history). */
  left: boolean;
}

export interface Lineup {
  gigId: string;
  members: LineupMember[];
}

export interface LineupCopyResult extends Lineup {
  sourceGigId: string;
}

export const replaceLineupSchema = z.object({
  membershipIds: z.array(z.string().uuid()).max(200),
});
export type ReplaceLineup = z.infer<typeof replaceLineupSchema>;
