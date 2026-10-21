"use client";

import { LibraryView } from "@/components/library/library-view";
import { useCurrentBand } from "@/lib/current-band";

/** Music Library tab content for the current band. */
export function LibraryTab() {
  const { currentBand } = useCurrentBand();
  return currentBand ? <LibraryView bandId={currentBand.id} /> : null;
}
