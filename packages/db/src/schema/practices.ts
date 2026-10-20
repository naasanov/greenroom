import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { createdAt, deletedAt, id, tstz, updatedAt } from "./helpers.js";
import { setlists } from "./music.js";
import { users } from "./users.js";

// Practices are never materialized: occurrences are expanded from `rrule` on read.
// A one-off practice is a series with a COUNT=1 rrule.
export const practiceSeries = pgTable(
  "practice_series",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    location: text("location"),
    rrule: text("rrule").notNull(),
    dtstart: tstz("dtstart").notNull(),
    timeZone: text("time_zone").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    gcalEventId: text("gcal_event_id"),
    gcalEtag: text("gcal_etag"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("practice_series_band_id_idx").on(t.bandId)],
);

// Overrides and cancellations of single occurrences, keyed by the occurrence's original start.
export const practiceOccurrenceOverrides = pgTable(
  "practice_occurrence_overrides",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => practiceSeries.id, { onDelete: "cascade" }),
    originalStart: tstz("original_start").notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    startsAt: tstz("starts_at"),
    endsAt: tstz("ends_at"),
    title: text("title"),
    location: text("location"),
    gcalInstanceEtag: text("gcal_instance_etag"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("practice_overrides_series_start_idx").on(
      t.seriesId,
      t.originalStart,
    ),
    index("practice_overrides_band_id_idx").on(t.bandId),
  ],
);

export const rsvpStatus = pgEnum("rsvp_status", [
  "going",
  "maybe",
  "not_going",
  "no_response",
]);

// Maps to Google attendee status: accepted, tentative, declined, needsAction.
export const practiceRsvps = pgTable(
  "practice_rsvps",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => practiceSeries.id, { onDelete: "cascade" }),
    originalStart: tstz("original_start").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatus("status").notNull().default("no_response"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("practice_rsvps_occurrence_user_idx").on(
      t.seriesId,
      t.originalStart,
      t.userId,
    ),
    index("practice_rsvps_band_id_idx").on(t.bandId),
  ],
);

export const assignmentScope = pgEnum("practice_assignment_scope", [
  "forward",
  "single",
]);

// Setlist for occurrence X: a `single` row with effective_from = X wins;
// otherwise the latest `forward` row with effective_from <= X.
export const practiceSetlistAssignments = pgTable(
  "practice_setlist_assignments",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => practiceSeries.id, { onDelete: "cascade" }),
    effectiveFrom: tstz("effective_from").notNull(),
    scope: assignmentScope("scope").notNull(),
    // Null is an explicit "no setlist" marker that shadows an earlier forward row.
    setlistId: uuid("setlist_id").references(() => setlists.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("practice_assignments_series_from_scope_idx").on(
      t.seriesId,
      t.effectiveFrom,
      t.scope,
    ),
    index("practice_assignments_band_id_idx").on(t.bandId),
  ],
);
