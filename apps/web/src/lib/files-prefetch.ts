import type { QueryClient } from "@tanstack/react-query";
import { filesFolderQuery } from "@/lib/queries/files";
import { googleStatusQuery } from "@/lib/queries/google";

/**
 * Warms the Files route chunk and, once the Google status confirms Drive is
 * linked with a folder, the root listing. Never requests the listing blind.
 */
export function prefetchFiles(qc: QueryClient, bandId: string): void {
  void import("@/components/files/files-tab");
  void qc
    .ensureQueryData({ ...googleStatusQuery(bandId), staleTime: 60_000 })
    .then((status) => {
      if (status.drive.linked && status.drive.folderId)
        return qc.prefetchQuery(filesFolderQuery(bandId, "root"));
    })
    .catch(() => {});
}
