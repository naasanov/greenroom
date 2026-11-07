"use client";

import { Music2 } from "lucide-react";
import type { SongCandidate } from "@greenroom/shared";
import { Thumbnail } from "@/components/app/list-card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "./song-utils";

/**
 * Confirmation step shown after picking a search result or pasted link: art,
 * title and artist, so the user can check it is the right song before the form.
 */
export function CandidatePreview({
  candidate,
  onConfirm,
  onBack,
}: {
  candidate: SongCandidate;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const duration = formatDuration(candidate.durationSeconds);
  return (
    <div
      data-testid="candidate-preview"
      className="flex flex-col items-center gap-5 pt-2 text-center"
    >
      <Thumbnail
        src={candidate.imageUrl}
        seed={candidate.title}
        className="size-40 rounded-2xl"
        icon={<Music2 className="size-14 opacity-70" />}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-lg font-semibold break-words">{candidate.title}</p>
        <p className="text-sm text-muted-foreground">
          {[candidate.artist, duration].filter(Boolean).join(" · ") ||
            "No artist"}
        </p>
        {candidate.existingSongId ? (
          <p className="text-xs font-medium text-primary">
            Already in your library
          </p>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button type="button" size="lg" onClick={onConfirm}>
          Use this song
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back to results
        </Button>
      </div>
    </div>
  );
}
