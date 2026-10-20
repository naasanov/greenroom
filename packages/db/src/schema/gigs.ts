import {
  boolean,
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { bands, memberships } from "./bands.js";
import { createdAt, deletedAt, id, tstz, updatedAt } from "./helpers.js";
import { users } from "./users.js";

// `date` is always set. `starts_at` is null when the time is not decided yet or all_day is true.
export const gigs = pgTable(
  "gigs",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    startsAt: tstz("starts_at"),
    endsAt: tstz("ends_at"),
    loadInAt: tstz("load_in_at"),
    timeZone: text("time_zone").notNull().default("UTC"),
    venueName: text("venue_name"),
    address: text("address"),
    googlePlaceId: text("google_place_id"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    showOnPublicCalendar: boolean("show_on_public_calendar")
      .notNull()
      .default(true),
    driveFolderId: text("drive_folder_id"),
    gcalEventId: text("gcal_event_id"),
    gcalEtag: text("gcal_etag"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("gigs_band_id_date_idx").on(t.bandId, t.date),
    index("gigs_gcal_event_id_idx").on(t.gcalEventId),
  ],
);

export const gigLineup = pgTable(
  "gig_lineup",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("gig_lineup_band_id_idx").on(t.bandId),
    index("gig_lineup_gig_membership_idx").on(t.gigId, t.membershipId),
  ],
);
