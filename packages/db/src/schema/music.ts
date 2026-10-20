import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { gigs } from "./gigs.js";
import { createdAt, deletedAt, id, updatedAt } from "./helpers.js";

export const songs = pgTable(
  "songs",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artist: text("artist"),
    durationSeconds: integer("duration_seconds"),
    spotifyTrackId: text("spotify_track_id"),
    youtubeUrl: text("youtube_url"),
    imageUrl: text("image_url"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("songs_band_id_idx").on(t.bandId)],
);

// Free-form label/value reference list (tabs, charts, lyrics). Imports append rows.
export const songLinks = pgTable(
  "song_links",
  {
    id: id(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("song_links_song_id_idx").on(t.songId)],
);

export const setlists = pgTable(
  "setlists",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("setlists_band_id_idx").on(t.bandId)],
);

export const setlistItems = pgTable(
  "setlist_items",
  {
    id: id(),
    setlistId: uuid("setlist_id")
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    index("setlist_items_setlist_position_idx").on(t.setlistId, t.position),
  ],
);

export const gigSetlists = pgTable(
  "gig_setlists",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    setlistId: uuid("setlist_id")
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("gig_setlists_gig_id_idx").on(t.gigId),
    index("gig_setlists_band_id_idx").on(t.bandId),
  ],
);
