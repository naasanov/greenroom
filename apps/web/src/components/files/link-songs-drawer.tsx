"use client";

import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSongPool } from "@/lib/queries/songs";

/** What the drawer edits: "replace" sets one entry's songs, "add" only adds to many. */
export interface LinkSongsTarget {
  entries: FileEntry[];
  mode: "replace" | "add";
}

function SongPicker({
  bandId,
  target,
  saving,
  error,
  onSave,
}: {
  bandId: string;
  target: LinkSongsTarget;
  saving: boolean;
  error: string | null;
  onSave: (songIds: string[]) => void;
}) {
  const songs = useSongPool(bandId, "title");
  const [query, setQuery] = useState("");
  const [linked] = useState(
    () =>
      new Set(
        target.mode === "replace"
          ? target.entries.flatMap((e) => e.songLinks.map((l) => l.songId))
          : [],
      ),
  );
  const [picked, setPicked] = useState(() => new Set(linked));
  const searchRef = useRef<HTMLInputElement>(null);
  // Re-asserts focus per frame (30 max) until the drawer's transition lets it
  // land, then for 10 more frames so a menu's deferred focus return loses.
  // Focus the user placed on another drawer element is left alone.
  useEffect(() => {
    const input = searchRef.current;
    if (!input) return;
    const drawer = input.closest('[role="dialog"]');
    let frames = 0;
    let settled = 0;
    let id = 0;
    const tick = () => {
      const active = document.activeElement;
      const stray =
        !active ||
        active === document.body ||
        (!!drawer && (active === drawer || !drawer.contains(active)));
      if (active !== input && stray) input.focus({ preventScroll: true });
      if (document.activeElement === input) settled += 1;
      else if (settled > 0) return;
      if (settled > 10 || ++frames >= 30) return;
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, []);
  const q = query.trim().toLowerCase();
  const matches = (songs.data ?? []).filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      (s.artist ?? "").toLowerCase().includes(q),
  );
  // Songs linked when the drawer opened lead; toggling does not reorder.
  const list = [
    ...matches.filter((s) => linked.has(s.id)),
    ...matches.filter((s) => !linked.has(s.id)),
  ];
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <div className="flex flex-col gap-3">
      <Input
        ref={searchRef}
        aria-label="Search songs"
        placeholder="Search songs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {songs.isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Loading songs
        </p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {songs.data?.length
            ? "No songs match."
            : "No songs in the library yet."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {list.map((s) => {
            const id = `link-song-${s.id}`;
            return (
              <li key={s.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 hover:bg-muted"
                >
                  <Checkbox
                    id={id}
                    checked={picked.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{s.title}</span>
                    {s.artist ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {s.artist}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        disabled={saving || (target.mode === "add" && picked.size === 0)}
        onClick={() => onSave([...picked])}
        className="sticky bottom-0"
      >
        Save
      </Button>
    </div>
  );
}

/** Multi-select over the band's song pool; "replace" mode sets the entry's songs, "add" mode starts empty and only adds. */
export function LinkSongsDrawer({
  bandId,
  target,
  saving,
  error,
  onSave,
  onClose,
}: {
  bandId: string;
  target: LinkSongsTarget | null;
  saving: boolean;
  error: string | null;
  onSave: (songIds: string[]) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const only = shown?.entries.length === 1 ? shown.entries[0]! : null;
  return (
    <BottomDrawer
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title="Link to songs"
      description={
        shown
          ? only
            ? (only.gig?.title ?? only.name)
            : `${shown.entries.length} items`
          : undefined
      }
      tall
    >
      {shown ? (
        <SongPicker
          key={`${shown.mode}:${shown.entries.map((e) => e.id).join(",")}`}
          bandId={bandId}
          target={shown}
          saving={saving}
          error={error}
          onSave={onSave}
        />
      ) : null}
    </BottomDrawer>
  );
}
