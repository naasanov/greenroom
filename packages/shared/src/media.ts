import { z } from "zod";

export const MEDIA_ERROR_CODES = {
  folderNotEmpty: "MEDIA_FOLDER_NOT_EMPTY",
  notAFolder: "DRIVE_NOT_A_FOLDER",
} as const;

export const MAX_BAND_PHOTO_BYTES = 10 * 1024 * 1024;

/** Setup state of the band's Drive structure. */
export const driveStatusSchema = z.object({
  linked: z.boolean(),
  /** True once a folder has been chosen and the Gigs / Profile photos folders exist. */
  folderSet: z.boolean(),
  folderId: z.string().nullable(),
  folderUrl: z.string().nullable(),
  gigsFolderId: z.string().nullable(),
  photosFolderId: z.string().nullable(),
});
export type DriveStatus = z.infer<typeof driveStatusSchema>;

export const setDriveFolderSchema = z.object({
  folderId: z.string().trim().min(1).max(200),
});
export type SetDriveFolder = z.infer<typeof setDriveFolderSchema>;

export const fakePickerFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export const fakePickerSchema = z.object({
  folders: z.array(fakePickerFolderSchema),
});
export type FakePicker = z.infer<typeof fakePickerSchema>;

export const mediaItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  /** True when the file no longer exists in Drive. */
  missing: z.boolean(),
  /** Linked music-library song, or null. */
  songId: z.string().uuid().nullable(),
  createdAt: z.string(),
  /** Absolute API URL, or null when Drive has no thumbnail for the file. */
  thumbnailUrl: z.string().nullable(),
  contentUrl: z.string(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const mediaFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
});
export type MediaFolder = z.infer<typeof mediaFolderSchema>;

export const mediaFolderWithItemsSchema = mediaFolderSchema.extend({
  items: z.array(mediaItemSchema),
});
export type MediaFolderWithItems = z.infer<typeof mediaFolderWithItemsSchema>;

export const mediaCountsSchema = z.object({
  photos: z.number().int(),
  videos: z.number().int(),
  other: z.number().int(),
});
export type MediaCounts = z.infer<typeof mediaCountsSchema>;

export const gigMediaSchema = z.object({
  driveLinked: z.boolean(),
  /** Null until the gig's Drive folder exists (it is created lazily). */
  driveFolderUrl: z.string().nullable(),
  folders: z.array(mediaFolderWithItemsSchema),
  unsorted: z.array(mediaItemSchema),
  counts: mediaCountsSchema,
});
export type GigMedia = z.infer<typeof gigMediaSchema>;

const folderName = z.string().trim().min(1).max(120);

export const createMediaFolderSchema = z.object({ name: folderName });
export type CreateMediaFolder = z.infer<typeof createMediaFolderSchema>;

export const renameSchema = z.object({ name: folderName });
export type RenameMedia = z.infer<typeof renameSchema>;

export const reorderMediaFoldersSchema = z.object({
  ids: z.array(z.string().uuid()).max(200),
});
export type ReorderMediaFolders = z.infer<typeof reorderMediaFoldersSchema>;

const itemIds = z.array(z.string().uuid()).min(1).max(500);

export const moveMediaItemsSchema = z.object({
  itemIds,
  /** Null moves the items to Unsorted (directly in the gig folder). */
  folderId: z.string().uuid().nullable(),
});
export type MoveMediaItems = z.infer<typeof moveMediaItemsSchema>;

export const trashMediaItemsSchema = z.object({ itemIds });
export type TrashMediaItems = z.infer<typeof trashMediaItemsSchema>;

export const bandPhotoSchema = z.object({ photoUrl: z.string().nullable() });
export type BandPhoto = z.infer<typeof bandPhotoSchema>;

export const memberPhotoSchema = z.object({ photoUrl: z.string().nullable() });
export type MemberPhoto = z.infer<typeof memberPhotoSchema>;

export const linkMediaSongSchema = z.object({
  itemIds,
  /** Null removes the song link. */
  songId: z.string().uuid().nullable(),
});
export type LinkMediaSong = z.infer<typeof linkMediaSongSchema>;

export const songMediaGroupSchema = z.object({
  gig: z.object({
    id: z.string().uuid(),
    title: z.string(),
    date: z.string(),
  }),
  items: z.array(mediaItemSchema),
});
export type SongMediaGroup = z.infer<typeof songMediaGroupSchema>;

// ---- resumable uploads ----

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024 * 1024;
export const MAX_ZIP_ITEMS = 200;
export const MEMBER_UPLOAD_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
] as const;

export const UPLOAD_ERROR_CODES = {
  typeNotAllowed: "UPLOAD_TYPE_NOT_ALLOWED",
  offsetMismatch: "UPLOAD_OFFSET_MISMATCH",
  driveError: "UPLOAD_DRIVE_ERROR",
  notActive: "UPLOAD_NOT_ACTIVE",
  tooLarge: "UPLOAD_TOO_LARGE",
  badChunk: "UPLOAD_BAD_CHUNK",
} as const;

export const uploadStatusSchema = z.enum([
  "pending",
  "uploading",
  "complete",
  "failed",
  "cancelled",
]);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

export const createUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  totalBytes: z.number().int().min(1),
  /** Client-computed name + size + lastModified. */
  fingerprint: z.string().trim().min(1).max(500),
  /** Null uploads to Unsorted. */
  folderId: z.string().uuid().nullable(),
  songId: z.string().uuid().nullable().optional(),
});
export type CreateUpload = z.infer<typeof createUploadSchema>;

export const patchUploadSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
    songId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) =>
      v.folderId !== undefined ||
      v.fileName !== undefined ||
      v.songId !== undefined,
    { message: "Nothing to update" },
  );
export type PatchUpload = z.infer<typeof patchUploadSchema>;

export const bulkPatchUploadsSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    folderId: z.string().uuid().nullable().optional(),
    songId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.folderId !== undefined || v.songId !== undefined, {
    message: "Nothing to update",
  });
export type BulkPatchUploads = z.infer<typeof bulkPatchUploadsSchema>;

export const uploadSessionSchema = z.object({
  id: z.string().uuid(),
  gigId: z.string().uuid(),
  status: uploadStatusSchema,
  bytesReceived: z.number().int(),
  totalBytes: z.number().int(),
  chunkSize: z.number().int(),
  fileName: z.string(),
  mimeType: z.string().nullable(),
  fingerprint: z.string(),
  folderId: z.string().uuid().nullable(),
  songId: z.string().uuid().nullable(),
  createdAt: z.string(),
  /** Set once the upload is complete. */
  item: mediaItemSchema.nullable(),
});
export type UploadSession = z.infer<typeof uploadSessionSchema>;

export const uploadOffsetMismatchSchema = z.object({
  code: z.literal(UPLOAD_ERROR_CODES.offsetMismatch),
  bytesReceived: z.number().int(),
});
export type UploadOffsetMismatch = z.infer<typeof uploadOffsetMismatchSchema>;

/** True when a member may upload this MIME type. */
export function memberUploadTypeAllowed(mime: string): boolean {
  const m = mime.toLowerCase();
  return MEMBER_UPLOAD_MIME_PREFIXES.some((p) => m.startsWith(p));
}

// ---- Public upload links ----

export const UPLOAD_LINK_ERROR_CODES = {
  invalid: "UPLOAD_LINK_INVALID",
  full: "UPLOAD_LINK_FULL",
} as const;

export const UPLOAD_LINK_EXPIRY_DAYS = [1, 7, 30] as const;
export const DEFAULT_LINK_MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;
export const DEFAULT_LINK_MAX_TOTAL_BYTES = 50 * 1024 * 1024 * 1024;
export const DEFAULT_LINK_MIME_PREFIXES = ["image/", "video/"] as const;

export const createUploadLinkSchema = z.object({
  expiresInDaysAfterGig: z
    .union([z.literal(1), z.literal(7), z.literal(30)])
    .optional(),
});
export type CreateUploadLink = z.infer<typeof createUploadLinkSchema>;

export const uploadLinkSchema = z.object({
  id: z.string().uuid(),
  url: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z
    .object({ id: z.string().uuid(), displayName: z.string() })
    .nullable(),
  uploadsCount: z.number().int(),
  bytesUsed: z.number(),
});
export type UploadLink = z.infer<typeof uploadLinkSchema>;

export const uploadLinkInvalidReasonSchema = z.enum([
  "expired",
  "revoked",
  "unknown",
]);
export type UploadLinkInvalidReason = z.infer<
  typeof uploadLinkInvalidReasonSchema
>;

/** What the public upload page may know about a link. */
export const publicUploadLinkInfoSchema = z.object({
  bandName: z.string(),
  bandPhotoUrl: z.string().nullable(),
  gigTitle: z.string(),
  gigDate: z.string(),
  expiresAt: z.string().nullable(),
  maxFileBytes: z.number(),
  allowedMimePrefixes: z.array(z.string()),
});
export type PublicUploadLinkInfo = z.infer<typeof publicUploadLinkInfoSchema>;

export const createPublicUploadSchema = createUploadSchema
  .omit({ folderId: true, songId: true })
  .extend({ uploaderName: z.string().trim().max(80).optional() });
export type CreatePublicUpload = z.infer<typeof createPublicUploadSchema>;

/** The slim session shape a public uploader sees. */
export const publicUploadSessionSchema = z.object({
  id: z.string().uuid(),
  status: uploadStatusSchema,
  bytesReceived: z.number().int(),
  totalBytes: z.number().int(),
  chunkSize: z.number().int(),
  fileName: z.string(),
});
export type PublicUploadSession = z.infer<typeof publicUploadSessionSchema>;
