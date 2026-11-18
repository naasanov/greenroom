"use client";

import { Loader2, Music } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { ChordsReader } from "@/components/chords/chords-reader";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { useChordSheet, useChordsIndex } from "@/lib/queries/chords";
import { useSongDetail } from "@/lib/queries/songs";

function Message({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <EmptyState
      className="py-24"
      icon={Music}
      title={title}
      description={description}
      action={
        <Button asChild variant="secondary">
          <Link href="/library">Back to Music Library</Link>
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

function ChordsPageBody({
  bandId,
  songId,
}: {
  bandId: string;
  songId: string;
}) {
  const router = useRouter();
  const index = useChordsIndex(bandId);
  const enabled = index.data?.enabled === true;
  const song = useSongDetail(bandId, songId);
  const sheet = useChordSheet(bandId, songId, enabled);

  if (index.isPending || (enabled && (song.isPending || sheet.isPending)))
    return <Pending />;
  if (!enabled)
    return (
      <Message
        title="Chords aren't available"
        description="Chords aren't turned on for this band."
      />
    );
  if (song.isError || !song.data)
    return (
      <Message
        title="Song not found"
        description="This song doesn't exist or you don't have access."
      />
    );
  if (sheet.isError || !sheet.data)
    return (
      <Message
        title="No chords for this song yet"
        description="Add chords from the song's page in the library."
      />
    );

  return (
    <ChordsReader
      bandId={bandId}
      songId={songId}
      title={song.data.title}
      artist={song.data.artist}
      durationSeconds={song.data.durationSeconds}
      sheet={sheet.data}
      variant="page"
      onClose={() =>
        window.history.length > 1 ? router.back() : router.push("/library")
      }
    />
  );
}

export default function SongChordsPage() {
  const { songId } = useParams<{ songId: string }>();
  const { currentBand } = useCurrentBand();
  if (!currentBand) return <Pending />;
  return <ChordsPageBody bandId={currentBand.id} songId={songId} />;
}
