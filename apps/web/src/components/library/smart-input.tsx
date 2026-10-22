"use client";

import { ListMusic, Loader2, Music2, Search } from "lucide-react";
import { useState } from "react";
import type { SongCandidate } from "@greenroom/shared";
import { Thumbnail } from "@/components/app/list-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResolveSong } from "@/lib/queries/songs";
import { useDebounced } from "./use-debounced";
import { formatDuration } from "./song-utils";

/**
 * The add sheet's first step: one input for a Spotify/YouTube link or a
 * search, with candidate previews and an "enter manually" escape hatch.
 */
export function SmartInput({
  bandId,
  initialText = "",
  onPick,
  onManual,
  onPlaylist,
  onOpenExisting,
}: {
  bandId: string;
  initialText?: string;
  onPick: (candidate: SongCandidate) => void;
  onManual: (text: string) => void;
  onPlaylist: (url: string) => void;
  onOpenExisting: (songId: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const input = useDebounced(text.trim(), 400);
  const settled = input === text.trim();
  const resolve = useResolveSong(bandId, input);
  const loading = text.trim().length > 0 && (!settled || resolve.isFetching);
  const result = settled && !resolve.isFetching ? resolve.data : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="Song link or search"
          placeholder="Paste a link or search Spotify"
          autoComplete="off"
          autoCapitalize="none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pr-10 pl-10"
        />
        {loading ? (
          <Loader2
            aria-label="Searching"
            className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      {result?.kind === "playlist" ? (
        <div
          data-testid="playlist-detected"
          className="flex flex-col items-start gap-2 rounded-2xl bg-gig-soft p-4 text-sm text-gig-soft-foreground"
        >
          <p>That looks like a playlist. Import all of its songs instead?</p>
          <Button type="button" onClick={() => onPlaylist(text.trim())}>
            <ListMusic /> Import playlist
          </Button>
        </div>
      ) : null}

      {result && result.kind !== "playlist" && result.candidates.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Matches">
          {result.candidates.map((c) => (
            <li key={`${c.source}-${c.spotifyTrackId ?? c.youtubeUrl}`}>
              <button
                type="button"
                data-testid="candidate"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2 text-left shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Thumbnail src={c.imageUrl} seed={c.title} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[0.95rem] font-semibold">
                    {c.title}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[c.artist, formatDuration(c.durationSeconds)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {c.existingSongId ? (
                    <span className="text-xs font-medium text-primary">
                      Already in your library
                    </span>
                  ) : null}
                </span>
              </button>
              {c.existingSongId ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-2"
                  onClick={() => onOpenExisting(c.existingSongId!)}
                >
                  Open it
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {result &&
      result.kind !== "playlist" &&
      result.candidates.length === 0 ? (
        <p
          data-testid="no-matches"
          className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          No matches. You can enter the song manually instead.
        </p>
      ) : null}
      {resolve.isError && settled ? (
        <p role="alert" className="text-sm text-destructive">
          Could not look that up. You can enter the song manually.
        </p>
      ) : null}

      <Button
        type="button"
        variant="link"
        className="self-start px-0"
        onClick={() => onManual(text.trim())}
      >
        <Music2 /> Enter manually
      </Button>
    </div>
  );
}
