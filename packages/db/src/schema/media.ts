import {
  bigint,
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
import { gigs } from "./gigs.js";
import { createdAt, deletedAt, id, tstz, updatedAt } from "./helpers.js";
import { songs } from "./music.js";
import { users } from "./users.js";

export const mediaFolders = pgTable(
  "media_folders",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    driveFolderId: text("drive_folder_id"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_folders_band_id_idx").on(t.bandId),
    index("media_folders_gig_id_idx").on(t.gigId),
    uniqueIndex("media_folders_drive_folder_id_idx").on(t.driveFolderId),
  ],
);

export const publicUploadLinks = pgTable(
  "public_upload_links",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: tstz("expires_at"),
    revokedAt: tstz("revoked_at"),
    maxFileBytes: bigint("max_file_bytes", { mode: "number" }),
    maxTotalBytes: bigint("max_total_bytes", { mode: "number" }),
    allowedMimePrefixes: text("allowed_mime_prefixes").array(),
    createdAt: createdAt(),
  },
  (t) => [
    index("public_upload_links_band_id_idx").on(t.bandId),
    index("public_upload_links_gig_id_idx").on(t.gigId),
  ],
);

// folder_id null means the gig's Unsorted bucket. trashed_at mirrors Drive trash;
// deleted_at is the in-app soft delete.
export const mediaItems = pgTable(
  "media_items",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => mediaFolders.id, {
      onDelete: "set null",
    }),
    driveFileId: text("drive_file_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    thumbnailUrl: text("thumbnail_url"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedViaLinkId: uuid("uploaded_via_link_id").references(
      () => publicUploadLinks.id,
      { onDelete: "set null" },
    ),
    // Linked library song; null when unlinked. name_customized stops song-title renames.
    songId: uuid("song_id").references(() => songs.id, {
      onDelete: "set null",
    }),
    nameCustomized: boolean("name_customized").notNull().default(false),
    missing: boolean("missing").notNull().default(false),
    trashedAt: tstz("trashed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("media_items_band_id_idx").on(t.bandId),
    index("media_items_gig_folder_idx").on(t.gigId, t.folderId),
    index("media_items_song_id_idx").on(t.songId),
    uniqueIndex("media_items_band_drive_file_idx").on(t.bandId, t.driveFileId),
  ],
);

export const uploadStatus = pgEnum("upload_status", [
  "pending",
  "uploading",
  "complete",
  "failed",
  "cancelled",
]);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: id(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => mediaFolders.id, {
      onDelete: "set null",
    }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedViaLinkId: uuid("uploaded_via_link_id").references(
      () => publicUploadLinks.id,
      { onDelete: "set null" },
    ),
    // Optional label a public-link uploader typed in.
    uploaderName: text("uploader_name"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    // Client-computed (name, size, lastModified) fingerprint used to resume or skip re-uploads.
    fileFingerprint: text("file_fingerprint").notNull(),
    driveSessionUrl: text("drive_session_url"),
    // Drive parent chosen when the session started; used to detect a later folder change.
    driveParentId: text("drive_parent_id"),
    // Edits made while uploading, applied to the media item on completion.
    songId: uuid("song_id").references(() => songs.id, {
      onDelete: "set null",
    }),
    nameCustomized: boolean("name_customized").notNull().default(false),
    mediaItemId: uuid("media_item_id").references(() => mediaItems.id, {
      onDelete: "set null",
    }),
    driveFileId: text("drive_file_id"),
    bytesReceived: bigint("bytes_received", { mode: "number" })
      .notNull()
      .default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    status: uploadStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("upload_sessions_band_id_idx").on(t.bandId),
    index("upload_sessions_gig_fingerprint_idx").on(t.gigId, t.fileFingerprint),
    index("upload_sessions_gig_status_idx").on(t.gigId, t.status),
  ],
);
