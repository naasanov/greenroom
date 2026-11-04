import { z } from "zod";

export const FILES_ERROR_CODES = {
  gigFolderProtected: "FILES_GIG_FOLDER_PROTECTED",
  rootProtected: "FILES_ROOT_PROTECTED",
  outsideRoot: "FILES_OUTSIDE_ROOT",
  gigAlreadyHasFolder: "GIG_ALREADY_HAS_FOLDER",
  folderAlreadyLinked: "FILES_FOLDER_ALREADY_LINKED",
  useGigMedia: "FILES_USE_GIG_MEDIA",
} as const;

/** Most entries one folder listing returns; `truncated` is set beyond it. */
export const FILES_LISTING_CAP = 1000;

const driveId = z.string().trim().min(1).max(200);
const fileName = z.string().trim().min(1).max(200);

export const fileGigSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  date: z.string(),
});
export type FileGig = z.infer<typeof fileGigSchema>;

export const fileSongLinkSchema = z.object({
  songId: z.string().uuid(),
  title: z.string(),
});
export type FileSongLink = z.infer<typeof fileSongLinkSchema>;

export const fileEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["folder", "file"]),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  modifiedTime: z.string(),
  thumbnailAvailable: z.boolean(),
  isGigsRoot: z.boolean(),
  /** The gig whose folder this is, null for every other entry. */
  gig: fileGigSchema.nullable(),
  songLinks: z.array(fileSongLinkSchema),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;

export const filesBreadcrumbSchema = z.object({
  id: z.string(),
  name: z.string(),
  isGigsRoot: z.boolean().optional(),
});
export type FilesBreadcrumb = z.infer<typeof filesBreadcrumbSchema>;

export const filesFolderListingSchema = z.object({
  folder: z.object({
    id: z.string(),
    name: z.string(),
    isRoot: z.boolean(),
    isGigsRoot: z.boolean(),
  }),
  /** Files root first, the listed folder last. */
  breadcrumbs: z.array(filesBreadcrumbSchema),
  /** Folders first, then files, each sorted by name (case-insensitive). */
  items: z.array(fileEntrySchema),
  truncated: z.boolean(),
});
export type FilesFolderListing = z.infer<typeof filesFolderListingSchema>;

export const createFilesFolderSchema = z.object({
  /** A folder id, or "root" for the Files root. */
  parentId: driveId,
  name: fileName,
});
export type CreateFilesFolder = z.infer<typeof createFilesFolderSchema>;

export const renameFileSchema = z.object({ name: fileName });
export type RenameFile = z.infer<typeof renameFileSchema>;

export const trashFilesSchema = z.object({
  ids: z.array(driveId).min(1).max(200),
});
export type TrashFiles = z.infer<typeof trashFilesSchema>;

export const setGigsFolderSchema = z.union([
  z.object({ folderId: driveId }),
  z.object({ create: z.literal(true), name: fileName.optional() }),
]);
export type SetGigsFolder = z.infer<typeof setGigsFolderSchema>;

export const linkGigFolderSchema = z.object({ folderId: driveId });
export type LinkGigFolder = z.infer<typeof linkGigFolderSchema>;

export const setFileSongsSchema = z.object({
  songIds: z.array(z.string().uuid()).max(100),
});
export type SetFileSongs = z.infer<typeof setFileSongsSchema>;

export const setFileSongsResultSchema = z.object({
  songLinks: z.array(fileSongLinkSchema),
});
export type SetFileSongsResult = z.infer<typeof setFileSongsResultSchema>;

/** A Drive file or folder linked to a song, as shown on the song detail. */
export const songFileSchema = z.object({
  id: z.string().uuid(),
  driveFileId: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  isFolder: z.boolean(),
  /** False when the file is trashed, gone, or no longer inside the Files root. */
  available: z.boolean(),
  sizeBytes: z.number().nullable(),
  modifiedTime: z.string().nullable(),
  thumbnailAvailable: z.boolean(),
  /** Containing folder, for opening it in the Files tab; null when unavailable. */
  parentId: z.string().nullable(),
  gig: fileGigSchema.nullable(),
});
export type SongFile = z.infer<typeof songFileSchema>;
