"use client";

import { useCallback } from "react";
import { useFilesUploads } from "@/components/media/upload/upload-provider";

/**
 * Upload entry point for the Files tab. Files go through the shared upload
 * store; `folderId` is a Drive folder id or "root". `entries` are the
 * Files-tab queue entries (active, failed).
 */
export function useFilesUpload(bandId: string) {
  const { store, entries } = useFilesUploads();

  const startUpload = useCallback(
    (files: File[], folderId: string) => {
      if (files.length === 0) return;
      store.addToFolder(bandId, folderId, files);
    },
    [store, bandId],
  );

  const openPicker = useCallback(
    (folderId: string) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () =>
        startUpload(Array.from(input.files ?? []), folderId);
      input.click();
    },
    [startUpload],
  );

  const failed = entries.filter(
    (e) => e.bandId === bandId && e.status === "error",
  );
  const retry = useCallback((key: string) => store.retry(key), [store]);
  const discard = useCallback((key: string) => store.cancel([key]), [store]);

  return { startUpload, openPicker, failed, retry, discard };
}
