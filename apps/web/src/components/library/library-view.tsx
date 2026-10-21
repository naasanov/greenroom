"use client";

import { ListMusic, Music, Plus, Search, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { SongSort } from "@greenroom/shared";
import { SONG_SORTS } from "@greenroom/shared";
import { DiscardChangesDialog } from "@/components/app/confirm-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { Fab } from "@/components/app/fab";
import { ListCard } from "@/components/app/list-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useSongs } from "@/lib/queries/songs";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import { SongSheet, type SheetTarget } from "./song-sheet";
import {
  SORT_LABELS,
  formatDuration,
  loadSort,
  saveSort,
  songArt,
} from "./song-utils";
import { useDebounced } from "./use-debounced";

const SONG_PATH = /^\/songs\/([^/]+)\/?$/;

/**
 * The Music Library tab: searchable, sortable song cards plus the song sheet.
 * The open song lives in the URL (`/songs/:id`) via the History API, so
 * opening and closing never remount the list.
 */
export function LibraryView({ bandId }: { bandId: string }) {
  const pathname = usePathname();
  const pathId = SONG_PATH.exec(pathname)?.[1] ?? null;
  // Local override so the sheet reacts before Next reports the new pathname.
  const [override, setOverride] = useState<string | null | undefined>(
    undefined,
  );
  const [prevPathId, setPrevPathId] = useState(pathId);
  if (pathId !== prevPathId) {
    setPrevPathId(pathId);
    setOverride(undefined);
  }
  const selectedId = override !== undefined ? override : pathId;

  const [adding, setAdding] = useState<number | null>(null);
  const nonce = useRef(0);
  const [importing, setImporting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const [sort, setSort] = useState<SongSort>("recent");
  const [sortReady, setSortReady] = useState(false);
  if (!sortReady && typeof window !== "undefined") {
    setSortReady(true);
    setSort(loadSort());
  }
  const songs = useSongs(bandId, { q, sort }, sortReady);

  const dirtyRef = useRef(false);
  const trackDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const guard = (action: () => void) => {
    if (dirtyRef.current) setDiscard(() => action);
    else action();
  };

  function setUrl(id: string | null) {
    const next = id ? `/songs/${id}` : "/library";
    if (id && !selectedId) window.history.pushState(null, "", next);
    else window.history.replaceState(null, "", next);
    setOverride(id);
  }

  const selectSong = (id: string) => {
    if (id === selectedId && adding === null) return;
    guard(() => {
      setAdding(null);
      setUrl(id);
    });
  };
  const closeSheet = () =>
    guard(() => {
      if (adding !== null) setAdding(null);
      else setUrl(null);
    });
  const openAdd = () =>
    guard(() => {
      if (selectedId) setUrl(null);
      setAdding(++nonce.current);
    });

  const target: SheetTarget | null =
    adding !== null
      ? { kind: "add", nonce: adding }
      : selectedId
        ? { kind: "song", id: selectedId }
        : null;
  const [lastTarget, setLastTarget] = useState<SheetTarget | null>(null);
  if (target && JSON.stringify(target) !== JSON.stringify(lastTarget)) {
    setLastTarget(target);
  }
  const shown = target ?? lastTarget;
  const sheetOpen = target !== null;
  const list = songs.data;

  return (
    <div
      data-testid="library-tab"
      className={cn(
        "transition-[padding] duration-300 ease-out motion-reduce:transition-none",
        sheetOpen && "md:pr-[26rem]",
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-28">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Music Library</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Sort songs">
                {SORT_LABELS[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(v) => {
                  const next = v as SongSort;
                  setSort(next);
                  saveSort(next);
                }}
              >
                {SONG_SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s} value={s}>
                    {SORT_LABELS[s]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search songs"
            placeholder="Search songs"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => setSearch("")}
            >
              <X />
            </Button>
          ) : null}
        </div>

        {list ? (
          list.length > 0 ? (
            <ul className="flex flex-col gap-2.5" aria-label="Songs">
              {list.map((s) => (
                <li key={s.id}>
                  <ListCard
                    title={s.title}
                    subtitle={s.artist ?? undefined}
                    meta={formatDuration(s.durationSeconds) ?? undefined}
                    thumbnail={songArt(s)}
                    selected={s.id === selectedId}
                    onClick={() => selectSong(s.id)}
                  />
                </li>
              ))}
            </ul>
          ) : q ? (
            <EmptyState
              icon={Search}
              title="No songs match your search"
              description="Try a different title or artist."
            />
          ) : (
            <EmptyState
              icon={Music}
              title="No music yet — press + to add one"
            />
          )
        ) : songs.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the library.
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading...
          </p>
        )}
      </div>

      <Fab
        label="Add music"
        actions={[
          {
            key: "add-song",
            label: "Add song",
            icon: <Plus />,
            onSelect: openAdd,
          },
          {
            key: "import-playlist",
            label: "Import playlist",
            icon: <ListMusic />,
            onSelect: () => setImporting(""),
          },
        ]}
      />

      {shown ? (
        <SongSheet
          bandId={bandId}
          target={shown}
          open={sheetOpen}
          siblings={(list ?? []).map((s) => s.id)}
          onSelect={selectSong}
          onRequestClose={closeSheet}
          onCreated={(song) => {
            setAdding(null);
            setUrl(song.id);
          }}
          onDeleted={() => setUrl(null)}
          onImport={(url) => {
            guard(() => {
              setAdding(null);
              setImporting(url);
            });
          }}
          onDirtyChange={trackDirty}
        />
      ) : null}

      <ImportDialog
        bandId={bandId}
        open={importing !== null}
        onOpenChange={(o) => !o && setImporting(null)}
        initialUrl={importing ?? ""}
      />
      <DiscardChangesDialog
        open={discard !== null}
        onOpenChange={(o) => !o && setDiscard(null)}
        onDiscard={() => {
          dirtyRef.current = false;
          discard?.();
          setDiscard(null);
        }}
      />
    </div>
  );
}
