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
