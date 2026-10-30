"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  History,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GigHistoryEntry, SongSummary } from "@greenroom/shared";
import { BottomDrawer, SideDrawer } from "@/components/app/bottom-drawer";
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
import { useSongs } from "@/lib/queries/songs";
import {
  useSetlist,
  useSetlistHistory,
  type SetlistSong,
} from "@/lib/queries/setlists";
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
  action,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  /** Icon button beside the field, as tall as the field. */
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 flex gap-2 bg-popover px-1 pt-1 pb-3">
      <div className="relative min-w-0 flex-1">
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
      {action}
    </div>
  );
}

/** Where the library drawer goes when there is no room beside the event drawer. */
const OVERLAY_CLASS = "right-0 w-full";

/** Beside the event drawer: bottom-aligned and tall even when the drawer is short. */
const SIDE_CLASS = "inset-y-auto bottom-0 h-[min(34rem,85dvh)]";

const asideClass = (mode: SetlistBuilder["mode"]) =>
  mode === "overlay" ? OVERLAY_CLASS : mode === "side" ? SIDE_CLASS : undefined;

function LibraryView({
  builder,
  search,
  setSearch,
}: {
  builder: SetlistBuilder;
  search: string;
  setSearch: (v: string) => void;
}) {
  const { songs, editor, guarded } = builder;
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
    <>
      <div data-testid="library-picker">
        <SearchBox
          value={search}
          onChange={setSearch}
          label="Search the library"
          placeholder="Search songs"
          action={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy from a past gig"
              title="Copy from a past gig"
              className="shrink-0"
              onClick={() => builder.setHistoryOpen(true)}
            >
              <History />
            </Button>
          }
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
    </>
  );
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));

function HistoryRow({
  entry: e,
  builder,
}: {
  entry: GigHistoryEntry;
  builder: SetlistBuilder;
}) {
  const [open, setOpen] = useState(false);
  const detail = useSetlist(builder.bandId, open ? e.setlistId : undefined);
  return (
    <li className="rounded-2xl border bg-card shadow-soft">
      <div className="flex items-stretch">
        <button
          type="button"
          data-testid="history-entry"
          onClick={() => builder.requestCopy(e)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-2xl px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="truncate text-sm font-semibold">{e.title}</span>
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
        <button
          type="button"
          data-testid="history-preview-toggle"
          aria-expanded={open}
          aria-label={`Preview songs in ${e.title}`}
          onClick={() => setOpen((v) => !v)}
          className="flex w-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {open ? (
        <div data-testid="history-preview" className="border-t px-3 py-2">
          {detail.data ? (
            detail.data.items.length > 0 ? (
              <ol className="flex flex-col gap-1">
                {detail.data.items.map((it) => (
                  <li key={it.itemId} className="flex flex-col text-sm">
                    <span className="truncate">{it.title}</span>
                    {it.artist ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {it.artist}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No songs.</p>
            )
          ) : detail.isError ? (
            <p role="alert" className="text-xs text-destructive">
              Could not load songs.
            </p>
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              Loading...
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function HistoryView({ builder }: { builder: SetlistBuilder }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const history = useSetlistHistory(builder.bandId, q, builder.historyOpen);
  const entries = history.data?.filter(
    (e) =>
      e.setlistId !== builder.setlistId && e.gigId !== builder.excludeGigId,
  );

  return (
    <>
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
              <HistoryRow key={e.setlistId} entry={e} builder={builder} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            title={q ? "No past gigs match" : "No past setlists yet"}
          />
        )}
      </div>
    </>
  );
}

/** False until a frame after `active` turns true, so a new sheet slides in. */
function useEntered(active: boolean): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!active) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [active]);
  return entered && active;
}

/**
 * The song sheet for adding a song in place. It lives in a non-modal Radix
 * dialog layer so its inputs keep focus even though the sheet is portaled
 * outside the hosting drawer, and Escape closes only the sheet. `onPick`
 * receives an existing song the user opened or a newly created one.
 */
function AddSongSheet({
  bandId,
  sheet,
  songs,
  closeSheet,
  onPick,
  title = "New song for the setlist",
}: {
  bandId: string;
  sheet: SetlistBuilder["sheet"];
  songs: SongSummary[] | undefined;
  closeSheet: () => void;
  onPick: (song: SetlistSong) => void;
  title?: string;
}) {
  const dirty = useRef(false);
  const [discard, setDiscard] = useState(false);
  const entered = useEntered(!!sheet);
  const open = !!sheet?.open && entered;

  const requestClose = () => {
    if (dirty.current) setDiscard(true);
    else closeSheet();
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
              {sheet.songId ? "Song" : title}
            </DialogPrimitive.Title>
            <SongSheet
              bandId={bandId}
              target={
                sheet.songId
                  ? { kind: "song", id: sheet.songId }
                  : { kind: "add", nonce: sheet.nonce }
              }
              open={open}
              initialText={sheet.initialText}
              siblings={[]}
              onSelect={(id) => {
                if (sheet.songId) return;
                const existing = songs?.find((s) => s.id === id);
                if (existing) onPick(toSetlistSong(existing));
                dirty.current = false;
                closeSheet();
              }}
              onRequestClose={requestClose}
              onCreated={(song) => {
                dirty.current = false;
                onPick(toSetlistSong(song));
                closeSheet();
              }}
              onDeleted={() => closeSheet()}
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
          closeSheet();
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
 * One drawer that shows either the music library or the copy-from-a-past-gig
 * list, so switching between them swaps content without the panel leaving.
 * Both views stay mounted, so each keeps its search text.
 */
function LibraryHistoryDrawer({ builder }: { builder: SetlistBuilder }) {
  const [search, setSearch] = useState("");
  const history = builder.historyOpen;
  return (
    <SideDrawer
      open={builder.libraryOpen || history}
      onOpenChange={(open) => {
        if (open) return builder.setLibraryOpen(true);
        builder.setLibraryOpen(false);
        builder.setHistoryOpen(false);
      }}
      title={history ? "Copy from a past gig" : "Music Library"}
      rise
      className={asideClass(builder.mode)}
      headerAction={
        history ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to the music library"
            onClick={() => builder.setLibraryOpen(true)}
          >
            <ArrowLeft />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add a new song"
            onClick={() => builder.openSheet(search.trim())}
          >
            <Plus />
          </Button>
        )
      }
    >
      <div hidden={history}>
        <LibraryView builder={builder} search={search} setSearch={setSearch} />
      </div>
      <div hidden={!history}>
        <HistoryView builder={builder} />
      </div>
    </SideDrawer>
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
      <LibraryHistoryDrawer builder={builder} />
      <AddSongSheet
        bandId={builder.bandId}
        sheet={builder.sheet}
        songs={builder.songs}
        closeSheet={builder.closeSheet}
        onPick={(song) =>
          void builder.guarded((target) => builder.editor.append(song, target))
        }
      />
      <CopyChoiceDialog builder={builder} />
    </>
  );
}

const SHEET_EXIT_MS = 400;

function PickRow({
  song,
  current,
  group,
  onPick,
}: {
  song: SongSummary;
  current: boolean;
  group: "setlist" | "library";
  onPick: (song: SetlistSong) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid="song-pick-row"
        data-group={group}
        aria-label={song.title}
        aria-pressed={current}
        onClick={() => onPick(toSetlistSong(song))}
        className="flex h-14 w-full touch-manipulation items-center gap-2.5 rounded-2xl border bg-card px-2.5 shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SongLine song={toSetlistSong(song)} />
        {current ? (
          <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />
        ) : null}
      </button>
    </li>
  );
}

function GroupHeading({ children }: { children: string }) {
  return (
    <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  );
}

/**
 * Single-pick version of the library drawer: same search, song rows and
 * add-a-song-in-place sheet, but a tap chooses one song instead of toggling
 * setlist membership. Songs in `firstSongIds` (a gig's setlist) list first.
 */
export function SongPickerDrawer({
  bandId,
  open,
  onOpenChange,
  title = "Link to song",
  firstSongIds = [],
  currentSongId = null,
  onPick,
  onClear,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  firstSongIds?: string[];
  currentSongId?: string | null;
  onPick: (song: SetlistSong) => void;
  /** Adds a "No song" row that calls this. */
  onClear?: () => void;
}) {
  const songsQuery = useSongs(bandId, { q: "", sort: "title" }, open);
  const songs = songsQuery.data;
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<SetlistBuilder["sheet"]>(null);
  const nonce = useRef(0);
  const q = search.trim().toLowerCase();

  const openSheet = useCallback((initialText = "") => {
    nonce.current += 1;
    setSheet({ nonce: nonce.current, initialText, open: true });
  }, []);
  const closeSheet = useCallback(() => {
    setSheet((s) => (s ? { ...s, open: false } : s));
    setTimeout(() => setSheet((s) => (s && !s.open ? null : s)), SHEET_EXIT_MS);
  }, []);

  const { first, rest } = useMemo(() => {
    const ids = new Set(firstSongIds);
    const match = (songs ?? []).filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q),
    );
    return {
      first: firstSongIds.flatMap((id) => match.find((s) => s.id === id) ?? []),
      rest: match.filter((s) => !ids.has(s.id)),
    };
  }, [songs, q, firstSongIds]);

  const pick = (song: SetlistSong) => {
    onPick(song);
    onOpenChange(false);
  };

  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      tall
      headerAction={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add a new song"
          onClick={() => openSheet(search.trim())}
        >
          <Plus />
        </Button>
      }
      aside={
        <AddSongSheet
          bandId={bandId}
          sheet={sheet}
          songs={songs}
          closeSheet={closeSheet}
          title="New song to link"
          onPick={pick}
        />
      }
    >
      <div data-testid="song-picker">
        <SearchBox
          value={search}
          onChange={setSearch}
          label="Search the library"
          placeholder="Search songs"
        />
        {onClear && !q ? (
          <Button
            type="button"
            variant="outline"
            className="mb-3 w-full"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
          >
            <X /> No song
          </Button>
        ) : null}
        {!songs ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading...
          </p>
        ) : first.length + rest.length === 0 ? (
          <div
            data-testid="library-no-match"
            className="flex flex-col items-center gap-3 py-6 text-center"
          >
            <p className="text-sm text-muted-foreground">
              {q
                ? `No songs match \u201c${search.trim()}\u201d.`
                : "Your library is empty."}
            </p>
            <Button type="button" onClick={() => openSheet(search.trim())}>
              <Plus /> {q ? "Add this song" : "Add song"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {first.length > 0 ? (
              <section aria-label="On this gig's setlist">
                <GroupHeading>On this gig&apos;s setlist</GroupHeading>
                <ul className="flex flex-col gap-2">
                  {first.map((s) => (
                    <PickRow
                      key={s.id}
                      song={s}
                      group="setlist"
                      current={s.id === currentSongId}
                      onPick={pick}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section aria-label="Library">
                {first.length > 0 ? <GroupHeading>Library</GroupHeading> : null}
                <ul className="flex flex-col gap-2">
                  {rest.map((s) => (
                    <PickRow
                      key={s.id}
                      song={s}
                      group="library"
                      current={s.id === currentSongId}
                      onPick={pick}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </BottomDrawer>
  );
}
