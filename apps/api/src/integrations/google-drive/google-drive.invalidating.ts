import type { DriveAncestryCache } from "./drive-ancestry-cache.js";
import type {
  DriveFileResult,
  GoogleDriveAdapter,
} from "./google-drive.adapter.js";

/** Delegates to the adapter and clears the ancestry cache after calls that change the folder tree. */
export function withAncestryInvalidation(
  inner: GoogleDriveAdapter,
  cache: DriveAncestryCache,
): GoogleDriveAdapter {
  const after = async <T>(run: Promise<T>): Promise<T> => {
    try {
      return await run;
    } finally {
      cache.clear();
    }
  };
  return {
    createFolder: (t, i) => after(inner.createFolder(t, i)),
    listChildren: (t, f) => inner.listChildren(t, f),
    getFile: (t, f) => inner.getFile(t, f),
    rename: (t, f, n): Promise<DriveFileResult> => after(inner.rename(t, f, n)),
    move: (t, f, p): Promise<DriveFileResult> => after(inner.move(t, f, p)),
    trash: (t, f): Promise<DriveFileResult> => after(inner.trash(t, f)),
    startResumableUpload: (t, i) => inner.startResumableUpload(t, i),
    uploadChunk: (t, s, c) => inner.uploadChunk(t, s, c),
    getUploadStatus: (t, s, n) => inner.getUploadStatus(t, s, n),
    getStartPageToken: (t) => inner.getStartPageToken(t),
    getChanges: (t, p) => inner.getChanges(t, p),
    download: (t, f, r) => inner.download(t, f, r),
    getThumbnail: (t, f) => inner.getThumbnail(t, f),
  };
}
