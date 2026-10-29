"use client";

import { GripVertical, Pencil, Upload, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ExportDialog,
  useExportReturn,
} from "@/components/library/export-dialog";
import { songArt } from "@/components/library/song-utils";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { cn } from "@/lib/utils";
import { exportDateLabel, useGigForExport } from "@/lib/queries/spotify-export";
import { PickTarget, TargetRow } from "./pick-dnd";
import { SongLine, setlistSummary, toSetlistSong } from "./song-row";
import type { SetlistBuilder } from "./use-setlist-builder";

export const SETLIST_TARGET = "setlist";

/** The open event, read from the drawer's URL (`/gigs/:id`, `/practices/:id?date=`). */
function useEventFromUrl(): {
  gigId: string | null;
  practiceDate: string | null;
} {
  const [, seg, id] = usePathname().split("/");
  const date = useSearchParams().get("date");
  return {
    gigId: seg === "gigs" && id ? id : null,
    practiceDate: seg === "practices" ? date : null,
  };
}

/**
 * The editable setlist inside an event drawer: ordered rows with reorder
 * handles and remove buttons. The header's pencil opens the music library
 * drawer. Every change saves immediately through the builder's editor.
 */
export function SetlistSection({
  builder,
  caption,
  extra,
}: {
  builder: SetlistBuilder;
  /** Quiet line under the heading. */
  caption?: ReactNode;
  /** Trailing action below the list (e.g. remove the setlist). */
  extra?: ReactNode;
}) {
  const { setlist, editor, guarded, songs } = builder;
  const items = setlist?.items;
  const ids = useMemo(() => items?.map((i) => i.songId) ?? [], [items]);
  const setOrder = editor.setOrder;

  const { currentBand } = useCurrentBand();
  const bandName = currentBand?.name ?? "Band";
  const { gigId, practiceDate } = useEventFromUrl();
  const gig = useGigForExport(builder.bandId, gigId);
  const pathname = usePathname();
  const search = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const exportBack = useExportReturn("setlist");
  const [exportSeen, setExportSeen] = useState(false);
  if (exportBack.resume && !exportSeen) {
    setExportSeen(true);
    setExporting(true);
  }
  const dateLabel = exportDateLabel(gigId ? gig.data?.date : practiceDate);
  const defaultName = gigId
    ? `${gig.data?.title ?? "Gig"} setlist${dateLabel ? ` (${dateLabel})` : ""}`
    : `${bandName} practice setlist${dateLabel ? ` (${dateLabel})` : ""}`;
  const returnTo = useMemo(() => {
    const next = new URLSearchParams(search);
    for (const k of ["spotify", "export", "exportName"]) next.delete(k);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, search]);

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
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
        <div className="-mr-1.5 flex shrink-0 items-center">
          {setlist && setlist.songCount > 0 && builder.setlistId ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Export to Spotify"
              className="text-muted-foreground"
              onClick={() => setExporting(true)}
            >
              <Upload />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit setlist"
            className="text-muted-foreground"
            disabled={!builder.ready}
            aria-expanded={builder.libraryOpen}
            onClick={() => {
              editor.clearError();
              builder.setLibraryOpen(!builder.libraryOpen);
            }}
          >
            <Pencil />
          </Button>
        </div>
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
                ? "No songs yet. Tap the pencil to add songs from your library or copy a past gig."
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
                dimWhenDragging={false}
                overlay={
                  <div className="flex h-14 cursor-grabbing items-center gap-2 rounded-2xl border border-primary/40 bg-card pr-3 pl-0.5 shadow-lift">
                    <span className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground/70">
                      <GripVertical className="size-5" />
                    </span>
                    <SongLine song={song} />
                  </div>
                }
              >
                {({ handleProps, dragging }) => (
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
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5",
                        dragging && "opacity-30",
                      )}
                    >
                      <SongLine song={song} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${item.title}`}
                      className={cn(
                        "shrink-0 text-muted-foreground",
                        dragging && "opacity-30",
                      )}
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

      {extra ? <div className="flex flex-wrap gap-2">{extra}</div> : null}
      {builder.setlistId ? (
        <ExportDialog
          bandId={builder.bandId}
          open={exporting}
          onOpenChange={(o) => {
            if (o) return;
            setExporting(false);
            exportBack.clear();
          }}
          target={{ kind: "setlist", setlistId: builder.setlistId }}
          defaultName={exportBack.resume?.name || defaultName}
          returnTo={returnTo}
          autoStart={exportBack.resume?.state === "start"}
          connectError={exportBack.resume?.state === "error"}
        />
      ) : null}
    </section>
  );
}
