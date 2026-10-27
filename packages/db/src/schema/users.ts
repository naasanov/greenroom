import {
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { createdAt, id, tstz, updatedAt } from "./helpers.js";

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  calendarEmail: text("calendar_email"),
  googleSub: text("google_sub").unique(),
  lastBandId: uuid("last_band_id").references((): AnyPgColumn => bands.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: id(),
  email: text("email").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  redirectTo: text("redirect_to"),
  expiresAt: tstz("expires_at").notNull(),
  usedAt: tstz("used_at"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const oauthProvider = pgEnum("oauth_provider", ["google", "spotify"]);

export const oauthConnections = pgTable(
  "oauth_connections",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: oauthProvider("provider").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    externalUserId: text("external_user_id"),
    externalDisplayName: text("external_display_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("oauth_connections_user_provider_idx").on(t.userId, t.provider),
  ],
);

/** Short-lived, single-use `state` values for provider OAuth round trips. */
export const oauthStates = pgTable("oauth_states", {
  id: id(),
  stateHash: text("state_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: oauthProvider("provider").notNull(),
  redirectTo: text("redirect_to").notNull(),
  // Set for per-band flows (Google Drive/Calendar linking): the band and the service.
  bandId: uuid("band_id").references((): AnyPgColumn => bands.id, {
    onDelete: "cascade",
  }),
  purpose: text("purpose"),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: createdAt(),
});
