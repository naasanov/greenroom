import { Guitar, Music2 } from "lucide-react";
import Link from "next/link";
import { useChordsIndex } from "@/lib/queries/chords";
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
  youtubeMusicUrl: s.youtubeMusicUrl,
});

/** A song's length; renders nothing when the length is unknown. */
export function SongDuration({
  seconds,
  onClick,
}: {
  seconds: number | null;
  onClick?: () => void;
}) {
  const duration = formatDuration(seconds);
  if (!duration) return null;
  return (
    <span
      onClick={onClick}
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
    >
      {duration}
    </span>
  );
}

/**
 * Art, title, artist and duration; fills the space between a row's controls.
 * `hideDuration` lets a row place the duration itself, after its own controls.
 */
export function SongLine({
  song,
  hideDuration = false,
}: {
  song: SongLineData;
  hideDuration?: boolean;
}) {
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
      {hideDuration ? null : <SongDuration seconds={song.durationSeconds} />}
    </>
  );
}

/** A small link to the chord reader; renders only for songs that have a sheet. */
export function SongChordsLink({
  bandId,
  songId,
  title,
}: {
  bandId: string;
  songId: string;
  title: string;
}) {
  const index = useChordsIndex(bandId);
  if (!index.data?.songIds.includes(songId)) return null;
  return (
    <Link
      href={`/songs/${songId}/chords`}
      data-testid="song-row-chords"
      aria-label={`Open chords for ${title}`}
      onClick={(e) => e.stopPropagation()}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Guitar className="size-4" />
    </Link>
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

/**
 * "12 songs · 47 min" plus a note for songs without a length; `compact`
 * shortens that note for narrow screens.
 */
export function setlistSummary(
  songCount: number,
  totalDurationSeconds: number,
  unknownDurationCount: number,
  compact = false,
): string {
  const minutes = Math.round(totalDurationSeconds / 60);
  const time =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
      : `${minutes} min`;
  const parts = [`${songCount} ${songCount === 1 ? "song" : "songs"}`];
  if (totalDurationSeconds > 0) parts.push(time);
  if (unknownDurationCount > 0) {
    parts.push(
      `${unknownDurationCount} ${compact ? "no length" : "without a length"}`,
    );
  }
  return parts.join(" · ");
}
