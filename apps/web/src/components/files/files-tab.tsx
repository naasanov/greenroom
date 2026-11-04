"use client";

import { useParams } from "next/navigation";
import { FilesView } from "@/components/files/files-view";
import { useCurrentBand } from "@/lib/current-band";

/** Files tab content for the current band; the route segment is the folder's Drive id. */
export function FilesTab() {
  const { currentBand } = useCurrentBand();
  const params = useParams<{ folder?: string[] }>();
  const folderId = params.folder?.[0] ?? "root";
  return currentBand ? (
    <FilesView
      key={`${currentBand.id}:${folderId}`}
      bandId={currentBand.id}
      folderId={folderId}
    />
  ) : null;
}
