import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./helpers.js";
import { users } from "./users.js";

export const bands = pgTable("bands", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  photoUrl: text("photo_url"),
  bio: text("bio"),
  socialLinks: jsonb("social_links")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  bookingContact: text("booking_contact"),
  // Opaque token in the public calendar URL; reset by writing a new value.
  publicCalendarToken: text("public_calendar_token")
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  driveRootFolderId: text("drive_root_folder_id"),
  driveLinkedByUserId: uuid("drive_linked_by_user_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  calendarId: text("calendar_id"),
  calendarLinkedByUserId: uuid("calendar_linked_by_user_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const membershipRole = pgEnum("membership_role", ["admin", "member"]);

// A leave sets left_at; rejoining inserts a new row. Past lineups keep pointing at the old row.
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("member"),
    joinedAt: tstz("joined_at").notNull().defaultNow(),
    leftAt: tstz("left_at"),
  },
  (t) => [
    index("memberships_band_id_idx").on(t.bandId),
    index("memberships_user_id_idx").on(t.userId),
    uniqueIndex("memberships_active_band_user_idx")
      .on(t.bandId, t.userId)
      .where(sql`${t.leftAt} is null`),
  ],
);

// Instruments belong to the user (set at signup and in personal settings), not a membership.
export const userInstruments = pgTable(
  "user_instruments",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    presetKey: text("preset_key"),
    customName: text("custom_name"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("user_instruments_user_id_idx").on(t.userId),
    check(
      "user_instruments_one_of_preset_custom",
      sql`(${t.presetKey} is null) <> (${t.customName} is null)`,
    ),
  ],
);

export const inviteLinks = pgTable(
  "invite_links",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [index("invite_links_band_id_idx").on(t.bandId)],
);
