import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { id, tstz } from "./helpers.js";

export const driveSyncCursors = pgTable(
  "drive_sync_cursors",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    pageToken: text("page_token").notNull(),
    lastPolledAt: tstz("last_polled_at"),
  },
  (t) => [uniqueIndex("drive_sync_cursors_band_id_idx").on(t.bandId)],
);

export const calendarSyncStates = pgTable(
  "calendar_sync_states",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    syncToken: text("sync_token"),
    lastSyncedAt: tstz("last_synced_at"),
  },
  (t) => [uniqueIndex("calendar_sync_states_band_id_idx").on(t.bandId)],
);
