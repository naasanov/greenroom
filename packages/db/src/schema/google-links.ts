import { pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { createdAt, id, tstz, updatedAt } from "./helpers.js";
import { users } from "./users.js";

export const googleLinkService = pgEnum("google_link_service", [
  "drive",
  "calendar",
]);

/** A band's Google account link for one service; tokens are encrypted at rest. */
export const bandGoogleLinks = pgTable(
  "band_google_links",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    service: googleLinkService("service").notNull(),
    googleSub: text("google_sub").notNull(),
    googleEmail: text("google_email").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    linkedByUserId: uuid("linked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("band_google_links_band_service_idx").on(t.bandId, t.service),
  ],
);
