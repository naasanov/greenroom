"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMemo, useRef, useState } from "react";
import type { GigHistoryEntry } from "@greenroom/shared";
import { SideDrawer } from "@/components/app/bottom-drawer";
import { DiscardChangesDialog } from "@/components/app/confirm-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { SongSheet } from "@/components/library/song-sheet";
import { useDebounced } from "@/components/library/use-debounced";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetlistHistory } from "@/lib/queries/setlists";
import { cn } from "@/lib/utils";
import { PickerRow } from "./pick-dnd";
import { SETLIST_TARGET } from "./setlist-section";
import { SongLine, SongOverlay, toSetlistSong } from "./song-row";
import type { SetlistBuilder } from "./use-setlist-builder";

function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 bg-popover px-1 pt-1 pb-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Where the library drawer goes when there is no room beside the event drawer. */
const OVERLAY_CLASS = "right-0 w-full";

/** Beside the event drawer: bottom-aligned and tall even when the drawer is short. */
const SIDE_CLASS = "inset-y-auto bottom-0 h-[min(34rem,85dvh)]";

const asideClass = (mode: SetlistBuilder["mode"]) =>
  mode === "overlay" ? OVERLAY_CLASS : mode === "side" ? SIDE_CLASS : undefined;

function LibraryDrawer({ builder }: { builder: SetlistBuilder }) {
  const { songs, editor, guarded } = builder;
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const inSetlist = useMemo(
    () => new Set(builder.setlist?.items.map((i) => i.songId)),
    [builder.setlist?.items],
  );
  const filtered = useMemo(
    () =>
      songs?.filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          (s.artist ?? "").toLowerCase().includes(q),
      ),
    [songs, q],
  );
  const draggable = builder.mode === "side";

  return (
    <SideDrawer
      open={builder.libraryOpen}
      onOpenChange={builder.setLibraryOpen}
      title="Music Library"
      className={asideClass(builder.mode)}
      headerAction={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add a new song"
          onClick={() => builder.openSheet(search.trim())}
        >
          <Plus />
        </Button>
      }
    >
      <div data-testid="library-picker">
        <SearchBox
          value={search}
          onChange={setSearch}
          label="Search the library"
          placeholder="Search songs"
        />
        {!filtered ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading...
          </p>
        ) : filtered.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Library songs">
            {filtered.map((s) => {
              const checked = inSetlist.has(s.id);
              const song = toSetlistSong(s);
              return (
                <PickerRow
                  key={s.id}
                  targetId={SETLIST_TARGET}
                  itemId={s.id}
                  draggable={draggable && !checked}
                  overlay={<SongOverlay song={song} />}
                >
                  <button
                    type="button"
                    aria-pressed={checked}
                    aria-label={s.title}
                    data-checked={checked}
                    onClick={() =>
                      void guarded((target) => editor.toggle(song, target))
                    }
                    className={cn(
                      "flex h-14 w-full touch-manipulation items-center gap-2.5 rounded-2xl border bg-card px-2.5 shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                      draggable && !checked && "cursor-grab",
                    )}
                  >
                    <SongLine song={song} />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {checked ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : null}
                    </span>
                  </button>
                </PickerRow>
              );
            })}
          </ul>
        ) : q ? (
          <div
            data-testid="library-no-match"
            className="flex flex-col items-center gap-3 py-6 text-center"
          >
            <p className="text-sm text-muted-foreground">
              No songs match &ldquo;{search.trim()}&rdquo;.
            </p>
            <Button
              type="button"
              onClick={() => builder.openSheet(search.trim())}
            >
              <Plus /> Add this song
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your library is empty.
            </p>
            <Button type="button" size="lg" onClick={() => builder.openSheet()}>
              <Plus /> Add song
            </Button>
          </div>
        )}
      </div>
    </SideDrawer>
  );
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));

function HistoryDrawer({ builder }: { builder: SetlistBuilder }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const history = useSetlistHistory(builder.bandId, q, builder.historyOpen);
  const entries = history.data?.filter(
    (e) =>
      e.setlistId !== builder.setlistId && e.gigId !== builder.excludeGigId,
  );

  return (
    <SideDrawer
      open={builder.historyOpen}
      onOpenChange={builder.setHistoryOpen}
      title="Copy from a past gig"
      className={asideClass(builder.mode)}
    >
      <div data-testid="history-picker">
        <SearchBox
          value={search}
          onChange={setSearch}
          label="Search past gigs"
          placeholder="Search by title or venue"
        />
        {!entries ? (
          history.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load past gigs.
            </p>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Loading...
            </p>
          )
        ) : entries.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Past gigs">
            {entries.map((e: GigHistoryEntry) => (
              <li key={e.setlistId}>
                <button
                  type="button"
                  data-testid="history-entry"
                  onClick={() => builder.requestCopy(e)}
                  className="flex w-full flex-col gap-0.5 rounded-2xl border bg-card px-3 py-2.5 text-left shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="truncate text-sm font-semibold">
                    {e.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      e.venueName,
                      dayLabel(e.date),
                      `${e.songCount} ${e.songCount === 1 ? "song" : "songs"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            title={q ? "No past gigs match" : "No past setlists yet"}
          />
        )}
      </div>
    </SideDrawer>
  );
}

/**
 * The song sheet for adding a song in place. It lives in a non-modal Radix
 * dialog layer so its inputs keep focus even though the sheet is portaled
 * outside the event drawer, and Escape closes only the sheet.
 */
function AddSongSheet({ builder }: { builder: SetlistBuilder }) {
  const { sheet, songs, editor, guarded } = builder;
  const dirty = useRef(false);
  const [discard, setDiscard] = useState(false);
  const open = !!sheet?.open;

  const requestClose = () => {
    if (dirty.current) setDiscard(true);
    else builder.closeSheet();
  };

  if (!sheet) return null;
  return (
    <>
      <DialogPrimitive.Root open modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              requestClose();
            }}
            className="pointer-events-none fixed inset-0 z-[60] outline-none [&>aside]:pointer-events-auto"
          >
            <DialogPrimitive.Title className="sr-only">
              New song for the setlist
            </DialogPrimitive.Title>
            <SongSheet
              bandId={builder.bandId}
              target={{ kind: "add", nonce: sheet.nonce }}
              open={open}
              initialText={sheet.initialText}
              siblings={[]}
              onSelect={(id) => {
                const existing = songs?.find((s) => s.id === id);
                if (existing) {
                  void guarded((target) =>
                    editor.append(toSetlistSong(existing), target),
                  );
                }
                dirty.current = false;
                builder.closeSheet();
              }}
              onRequestClose={requestClose}
              onCreated={(song) => {
                dirty.current = false;
                void guarded((target) =>
                  editor.append(toSetlistSong(song), target),
                );
                builder.closeSheet();
              }}
              onDeleted={() => builder.closeSheet()}
              onDirtyChange={(d) => {
                dirty.current = d;
              }}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <DiscardChangesDialog
        open={discard}
        onOpenChange={setDiscard}
        onDiscard={() => {
          dirty.current = false;
          setDiscard(false);
          builder.closeSheet();
        }}
      />
    </>
  );
}

function CopyChoiceDialog({ builder }: { builder: SetlistBuilder }) {
  const entry = builder.copyEntry;
  // Keeps the last entry so the text does not blank while the dialog fades.
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  return (
    <AlertDialog
      open={!!entry}
      onOpenChange={(o) => !o && builder.cancelCopy()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">
            Copy this setlist?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {shown
              ? `This setlist already has songs. Replace them with the ${shown.songCount} from ${shown.title}, or add those to the end.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            onClick={() => shown && builder.copy(shown, "append")}
          >
            Add to end
          </AlertDialogAction>
          <AlertDialogAction
            variant="danger"
            onClick={() => shown && builder.copy(shown, "replace")}
          >
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Everything that sits beside or over the event drawer: pass as the
 * `BottomDrawer` `aside`. Includes the library and copy drawers, the add-song
 * sheet, and the replace-or-append question.
 */
export function SetlistAside({ builder }: { builder: SetlistBuilder }) {
  if (!builder.ready) return null;
  return (
    <>
      <LibraryDrawer builder={builder} />
      <HistoryDrawer builder={builder} />
      <AddSongSheet builder={builder} />
      <CopyChoiceDialog builder={builder} />
    </>
  );
}
