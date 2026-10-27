"use client";

import { GripVertical, History, ListPlus, X } from "lucide-react";
import { useCallback, useMemo, type ReactNode } from "react";
import { songArt } from "@/components/library/song-utils";
import { Button } from "@/components/ui/button";
import { PickTarget, TargetRow } from "./pick-dnd";
import {
  SongLine,
  SongOverlay,
  setlistSummary,
  toSetlistSong,
} from "./song-row";
import type { SetlistBuilder } from "./use-setlist-builder";

export const SETLIST_TARGET = "setlist";

/**
 * The editable setlist inside an event drawer: ordered rows with reorder
 * handles and remove buttons, plus the Add songs / Copy buttons. Every change
 * saves immediately through the builder's editor.
 */
export function SetlistSection({
  builder,
  caption,
  extra,
}: {
  builder: SetlistBuilder;
  /** Quiet line under the heading. */
  caption?: ReactNode;
  /** Trailing action in the button row (e.g. remove the setlist). */
  extra?: ReactNode;
}) {
  const { setlist, editor, guarded, songs } = builder;
  const items = setlist?.items;
  const ids = useMemo(() => items?.map((i) => i.songId) ?? [], [items]);
  const setOrder = editor.setOrder;

  const onChange = useCallback(
    (next: string[], change: { added?: string }) => {
      const added = change.added
        ? songs?.find((s) => s.id === change.added)
        : undefined;
      void guarded((target) =>
        setOrder(next, added ? [toSetlistSong(added)] : [], target),
      );
    },
    [songs, guarded, setOrder],
  );

  return (
    <section
      data-testid="setlist-section"
      aria-labelledby="setlist-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="setlist-heading" className="text-base font-semibold">
          Setlist
        </h3>
        {setlist && setlist.songCount > 0 ? (
          <p
            data-testid="setlist-total"
            className="text-sm text-muted-foreground tabular-nums"
          >
            {setlistSummary(
              setlist.songCount,
              setlist.totalDurationSeconds,
              setlist.unknownDurationCount,
            )}
          </p>
        ) : null}
      </div>
      {caption ? (
        <p className="-mt-2 text-sm text-muted-foreground">{caption}</p>
      ) : null}

      {!setlist && builder.setlistId ? (
        builder.loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the setlist.
          </p>
        ) : (
          <div
            aria-busy="true"
            className="h-14 animate-pulse rounded-2xl bg-muted"
          />
        )
      ) : (
        <PickTarget
          targetId={SETLIST_TARGET}
          ids={ids}
          onChange={onChange}
          empty={
            <p
              data-testid="setlist-empty"
              className="flex h-14 items-center rounded-2xl border border-dashed px-4 text-sm text-muted-foreground"
            >
              {builder.setlistId
                ? "No songs yet. Add some from your library or copy a past gig."
                : "No setlist"}
            </p>
          }
        >
          {(setlist?.items ?? []).map((item) => {
            const song = {
              title: item.title,
              artist: item.artist,
              durationSeconds: item.durationSeconds,
              imageUrl: songArt(item),
            };
            return (
              <TargetRow
                key={item.songId}
                itemId={item.songId}
                overlay={<SongOverlay song={song} />}
              >
                {({ handleProps }) => (
                  <div
                    data-testid="setlist-row"
                    className="flex h-full items-center gap-2 rounded-2xl border bg-card pr-1 pl-0.5 shadow-soft"
                  >
                    <button
                      type="button"
                      aria-label={`Reorder ${item.title}`}
                      {...handleProps}
                      className="flex h-full w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground/70 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                    >
                      <GripVertical className="size-5" />
                    </button>
                    <SongLine song={song} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${item.title}`}
                      className="shrink-0 text-muted-foreground"
                      onClick={() =>
                        void guarded((target) =>
                          editor.remove(item.songId, target),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </TargetRow>
            );
          })}
        </PickTarget>
      )}

      {editor.error || builder.copyFailed ? (
        <p role="alert" className="text-sm text-destructive">
          Could not save that change. The setlist was reloaded.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!builder.ready}
          aria-expanded={builder.libraryOpen}
          onClick={() => {
            editor.clearError();
            builder.setLibraryOpen(!builder.libraryOpen);
          }}
        >
          <ListPlus /> Add songs
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!builder.ready}
          aria-expanded={builder.historyOpen}
          onClick={() => {
            editor.clearError();
            builder.setHistoryOpen(!builder.historyOpen);
          }}
        >
          <History /> Copy from a past gig
        </Button>
        {extra}
      </div>
    </section>
  );
}
