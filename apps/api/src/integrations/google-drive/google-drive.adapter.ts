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
  modifiedTime: string;
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

export interface GoogleDriveAdapter {
  createFolder(input: { name: string; parentId: string }): Promise<DriveFile>;
  /** Lists non-trashed children of a folder. */
  listChildren(folderId: string): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFileResult>;
  rename(fileId: string, name: string): Promise<DriveFileResult>;
  move(fileId: string, newParentId: string): Promise<DriveFileResult>;
  /** Moves to Drive trash (recoverable). */
  trash(fileId: string): Promise<DriveFileResult>;
  /** Returns an opaque resumable session URI. */
  startResumableUpload(
    input: StartUploadInput,
  ): Promise<{ sessionUri: string }>;
  uploadChunk(
    sessionUri: string,
    chunk: UploadChunkInput,
  ): Promise<UploadChunkResult>;
  getUploadStatus(sessionUri: string): Promise<UploadStatusResult>;
  getStartPageToken(): Promise<string>;
  getChanges(pageToken: string): Promise<DriveChangesResult>;
  download(fileId: string): Promise<DriveDownloadResult>;
}
