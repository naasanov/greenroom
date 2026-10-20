import { notImplemented } from "../not-implemented.js";
import type {
  DriveChangesResult,
  DriveDownloadResult,
  DriveFile,
  DriveFileResult,
  GoogleDriveAdapter,
  UploadChunkResult,
  UploadStatusResult,
} from "./google-drive.adapter.js";

const ni = <T>(): Promise<T> => notImplemented("GoogleDrive", "5.2");

export class RealGoogleDriveAdapter implements GoogleDriveAdapter {
  createFolder(): Promise<DriveFile> {
    return ni();
  }
  listChildren(): Promise<DriveFile[]> {
    return ni();
  }
  getFile(): Promise<DriveFileResult> {
    return ni();
  }
  rename(): Promise<DriveFileResult> {
    return ni();
  }
  move(): Promise<DriveFileResult> {
    return ni();
  }
  trash(): Promise<DriveFileResult> {
    return ni();
  }
  startResumableUpload(): Promise<{ sessionUri: string }> {
    return ni();
  }
  uploadChunk(): Promise<UploadChunkResult> {
    return ni();
  }
  getUploadStatus(): Promise<UploadStatusResult> {
    return ni();
  }
  getStartPageToken(): Promise<string> {
    return ni();
  }
  getChanges(): Promise<DriveChangesResult> {
    return ni();
  }
  download(): Promise<DriveDownloadResult> {
    return ni();
  }
}
