import { Music2 } from "lucide-react";
import type { SongSummary } from "@greenroom/shared";
import { Thumbnail } from "@/components/app/list-card";
import { formatDuration, songArt } from "@/components/library/song-utils";
import type { SetlistSong } from "@/lib/queries/setlists";
import { cn } from "@/lib/utils";

/** The fields every song row in the setlist UI needs. */
export interface SongLineData {
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  imageUrl: string | null;
}

export const toSetlistSong = (s: SongSummary): SetlistSong => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  durationSeconds: s.durationSeconds,
  imageUrl: songArt(s),
  youtubeUrl: s.youtubeUrl,
});

/** Art, title, artist and duration; fills the space between a row's controls. */
export function SongLine({ song }: { song: SongLineData }) {
  const duration = formatDuration(song.durationSeconds);
  return (
    <>
      <Thumbnail
        src={song.imageUrl}
        seed={song.title}
        className="size-10 rounded-lg"
        icon={<Music2 className="size-4 opacity-70" />}
      />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm leading-tight font-semibold">
          {song.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {song.artist ?? "No artist"}
        </span>
      </span>
      {duration ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {duration}
        </span>
      ) : null}
    </>
  );
}

/** The floating copy of a row shown under the cursor while dragging. */
export function SongOverlay({
  song,
  className,
}: {
  song: SongLineData;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-14 cursor-grabbing items-center gap-2.5 rounded-2xl border border-primary/40 bg-card px-3 shadow-lift",
        className,
      )}
    >
      <SongLine song={song} />
    </div>
  );
}

/** "12 songs · 47 min" plus a note for songs without a length. */
export function setlistSummary(
  songCount: number,
  totalDurationSeconds: number,
  unknownDurationCount: number,
): string {
  const minutes = Math.round(totalDurationSeconds / 60);
  const time =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
      : `${minutes} min`;
  const parts = [`${songCount} ${songCount === 1 ? "song" : "songs"}`];
  if (totalDurationSeconds > 0) parts.push(time);
  if (unknownDurationCount > 0) {
    parts.push(`${unknownDurationCount} without a length`);
  }
  return parts.join(" · ");
}
