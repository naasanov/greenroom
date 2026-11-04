"use client";

import { useCallback, useState } from "react";

/**
 * Upload entry point for the Files tab. Currently a stub: it opens the file
 * picker and reports that folder uploads are not available yet.
 */
export function useFilesUpload() {
  const [notice, setNotice] = useState<string | null>(null);

  const startUpload = useCallback((files: File[], folderId: string) => {
    void folderId;
    if (files.length === 0) return;
    setNotice("Uploads to folders are coming soon");
  }, []);

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

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { startUpload, openPicker, notice, dismissNotice };
}
