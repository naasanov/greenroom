import type { QueryClient } from "@tanstack/react-query";
import { filesFolderQuery } from "@/lib/queries/files";
import { googleKeys } from "@/lib/queries/google";

/**
 * Warms the Files route chunk and the root listing. Skips the listing when the
 * cached Google status already says Drive is not set up.
 */
export function prefetchFiles(qc: QueryClient, bandId: string): void {
  void import("@/components/files/files-tab");
  const status = qc.getQueryData<{
    drive?: { linked: boolean; folderId: string | null };
  }>(googleKeys.status(bandId));
  if (status?.drive && !(status.drive.linked && status.drive.folderId)) return;
  void qc.prefetchQuery(filesFolderQuery(bandId, "root"));
}
