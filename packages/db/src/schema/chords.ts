import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { songs } from "./music.js";
import { createdAt, tstz, updatedAt } from "./helpers.js";

/** Structural shape of the stored sheet; the full type lives in @greenroom/shared. */
export interface StoredChordSheet {
  version: 1;
  lines: unknown[];
}

/** One cached Ultimate Guitar search hit. */
export interface UgSearchResult {
  songName: string;
  artistName: string;
  type: string | null;
  rating: number | null;
  votes: number | null;
  url: string;
  accessType: string | null;
  marketingType: string | null;
}

export const songChordSheets = pgTable("song_chord_sheets", {
  songId: uuid("song_id")
    .primaryKey()
    .references(() => songs.id, { onDelete: "cascade" }),
  sheet: jsonb("sheet").$type<StoredChordSheet>().notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  key: text("key"),
  capo: integer("capo"),
  tuning: text("tuning"),
  bandTranspose: integer("band_transpose").notNull().default(0),
  editedAt: tstz("edited_at"),
  importedAt: tstz("imported_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ugSearchCache = pgTable("ug_search_cache", {
  queryKey: text("query_key").primaryKey(),
  results: jsonb("results").$type<UgSearchResult[]>().notNull(),
  fetchedAt: tstz("fetched_at").notNull().defaultNow(),
});
