import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { createdAt, id, tstz, updatedAt } from "./helpers.js";

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

// Invite bookkeeping per event (gig or practice series) and recipient address (lowercased).
// `event_id` is not a foreign key because it points at either table.
export const calendarInvites = pgTable(
  "calendar_invites",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"gig" | "series">().notNull(),
    eventId: uuid("event_id").notNull(),
    email: text("email").notNull(),
    uid: text("uid").notNull(),
    sequence: integer("sequence").notNull().default(0),
    lastSentAt: tstz("last_sent_at"),
    lastPayloadHash: text("last_payload_hash"),
    cancelledAt: tstz("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("calendar_invites_event_email_idx").on(
      t.kind,
      t.eventId,
      t.email,
    ),
    index("calendar_invites_band_id_idx").on(t.bandId),
  ],
);
