"use client";

import { Link2Off, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { useCurrentBand } from "@/lib/current-band";
import { useSongLink } from "@/lib/queries";
import { LibraryView } from "./library-view";

/** Switches the current band to the link's band once, when it differs. */
function useAdoptBand(bandId: string | undefined) {
  const { currentBand, setCurrentBandId } = useCurrentBand();
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!bandId || adopted.current === bandId) return;
    adopted.current = bandId;
    if (currentBand?.id !== bandId) setCurrentBandId(bandId);
  }, [bandId, currentBand?.id, setCurrentBandId]);
}

function NoAccess({ error }: { error: unknown }) {
  const missing = isApiError(error, 404);
  return (
    <EmptyState
      className="py-24"
      icon={Link2Off}
      title={
        missing
          ? "This link doesn't exist or you don't have access"
          : "Something went wrong"
      }
      description={
        missing
          ? "Ask a bandmate to send the link again."
          : "Please reload and try again."
      }
      action={
        <Button asChild variant="secondary">
          <Link href="/library">Go to Music Library</Link>
        </Button>
      }
    />
  );
}

function Pending() {
  return (
    <div className="flex justify-center py-24">
      <Loader2
        aria-label="Loading"
        className="size-6 animate-spin text-muted-foreground"
      />
    </div>
  );
}

/**
 * `/songs/:id`: resolves the song's band, switches to it, and shows the
 * library with that song's sheet open (the open song is read from the URL).
 */
export function SongLinkView({ songId }: { songId: string }) {
  const link = useSongLink(songId);
  const bandId = link.data?.bandId;
  useAdoptBand(bandId);

  if (link.isError) return <NoAccess error={link.error} />;
  if (!bandId) return <Pending />;
  return <LibraryView bandId={bandId} />;
}
