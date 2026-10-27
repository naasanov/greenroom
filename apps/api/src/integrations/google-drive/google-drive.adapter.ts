import type { Readable } from "node:stream";

export const GOOGLE_DRIVE = Symbol("GOOGLE_DRIVE");

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Parent folder id, null for the root. */
  parentId: string | null;
  trashed: boolean;
  size: number;
  /** ISO 8601. */
  modifiedTime: string;
  /** ISO 8601. */
  createdTime: string;
  /** Null for folders and Google-native docs. */
  md5Checksum: string | null;
  /** Short-lived URL; fetch through getThumbnail rather than directly. */
  thumbnailLink: string | null;
}

export type DriveFileResult =
  { status: "ok"; file: DriveFile } | { status: "not-found" };

export interface DriveChange {
  fileId: string;
  /** True when the file was permanently deleted or is no longer accessible. */
  removed: boolean;
  /** Present when not removed; includes the trashed flag. */
  file?: DriveFile;
}

export interface DriveChangesResult {
  changes: DriveChange[];
  newStartPageToken: string;
}

export interface StartUploadInput {
  name: string;
  parentId: string;
  mimeType: string;
  totalSize: number;
}

export interface UploadChunkInput {
  /** Inclusive byte offsets of this chunk within the whole file. */
  start: number;
  end: number;
  total: number;
  /**
   * Google requires every chunk except the last to be a multiple of
   * 256 KiB (262144 bytes); the last chunk may be any size.
   */
  data: Buffer;
}

export type UploadChunkResult =
  | { status: "incomplete"; receivedBytes: number }
  | { status: "complete"; file: DriveFile }
  | { status: "offset-mismatch"; receivedBytes: number }
  | { status: "session-not-found" };

export type UploadStatusResult =
  | { status: "incomplete"; receivedBytes: number }
  | { status: "complete"; file: DriveFile }
  | { status: "session-not-found" };

export type DriveDownloadResult =
  | { status: "ok"; stream: Readable; size: number; name: string }
  | { status: "not-found" };

/**
 * Every method takes the band's linked Google account access token first.
 * Resumable session URIs are bound to the account that started them.
 */
export interface GoogleDriveAdapter {
  createFolder(
    accessToken: string,
    input: { name: string; parentId: string },
  ): Promise<DriveFile>;
  /** Lists non-trashed children of a folder. */
  listChildren(accessToken: string, folderId: string): Promise<DriveFile[]>;
  getFile(accessToken: string, fileId: string): Promise<DriveFileResult>;
  rename(
    accessToken: string,
    fileId: string,
    name: string,
  ): Promise<DriveFileResult>;
  move(
    accessToken: string,
    fileId: string,
    newParentId: string,
  ): Promise<DriveFileResult>;
  /** Moves to Drive trash (recoverable). */
  trash(accessToken: string, fileId: string): Promise<DriveFileResult>;
  /** Returns an opaque resumable session URI. */
  startResumableUpload(
    accessToken: string,
    input: StartUploadInput,
  ): Promise<{ sessionUri: string }>;
  /**
   * offset-mismatch means the server's received byte count differs from
   * what this chunk assumed; resume from the returned receivedBytes.
   */
  uploadChunk(
    accessToken: string,
    sessionUri: string,
    chunk: UploadChunkInput,
  ): Promise<UploadChunkResult>;
  /** Pass totalSize when known; the status query sends a byte-range header with that total. */
  getUploadStatus(
    accessToken: string,
    sessionUri: string,
    totalSize?: number,
  ): Promise<UploadStatusResult>;
  getStartPageToken(accessToken: string): Promise<string>;
  getChanges(
    accessToken: string,
    pageToken: string,
  ): Promise<DriveChangesResult>;
  download(accessToken: string, fileId: string): Promise<DriveDownloadResult>;
  /** Thumbnail image bytes (about 400px). Not-found when the file or thumbnail is missing. */
  getThumbnail(
    accessToken: string,
    fileId: string,
  ): Promise<DriveDownloadResult>;
}
