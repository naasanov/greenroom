"use client";

import { useState } from "react";
import type { FileEntry } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSongPool } from "@/lib/queries/songs";

function SongPicker({
  bandId,
  entry,
  saving,
  error,
  onSave,
}: {
  bandId: string;
  entry: FileEntry;
  saving: boolean;
  error: string | null;
  onSave: (songIds: string[]) => void;
}) {
  const songs = useSongPool(bandId, "title");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(
    () => new Set(entry.songLinks.map((l) => l.songId)),
  );
  const q = query.trim().toLowerCase();
  const list = (songs.data ?? []).filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      (s.artist ?? "").toLowerCase().includes(q),
  );
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <div className="flex flex-col gap-3">
      <Input
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
        disabled={saving}
        onClick={() => onSave([...picked])}
        className="sticky bottom-0"
      >
        Save
      </Button>
    </div>
  );
}

/** Multi-select over the band's song pool; saving replaces the entry's song set. */
export function LinkSongsDrawer({
  bandId,
  entry,
  saving,
  error,
  onSave,
  onClose,
}: {
  bandId: string;
  entry: FileEntry | null;
  saving: boolean;
  error: string | null;
  onSave: (songIds: string[]) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  return (
    <BottomDrawer
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title="Link to songs"
      description={shown ? (shown.gig?.title ?? shown.name) : undefined}
      tall
    >
      {shown ? (
        <SongPicker
          key={shown.id}
          bandId={bandId}
          entry={shown}
          saving={saving}
          error={error}
          onSave={onSave}
        />
      ) : null}
    </BottomDrawer>
  );
}
