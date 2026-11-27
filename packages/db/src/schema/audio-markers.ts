import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { users } from "./users.js";
import { createdAt, id, updatedAt } from "./helpers.js";

/** Band-shared markers on a Drive audio file (`file_id` is the Drive file id). */
export const audioMarkers = pgTable(
  "audio_markers",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull(),
    positionMs: integer("position_ms").notNull(),
    title: text("title").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("audio_markers_band_file_idx").on(t.bandId, t.fileId)],
);
