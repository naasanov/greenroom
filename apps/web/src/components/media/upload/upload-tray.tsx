"use client";

import { Music2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaFolder } from "@greenroom/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GigDefaults, UploadEntry } from "./upload-store";
import { UploadTile } from "./upload-tile";

/** Thin bottom tray: batch bar, bulk folder/song strip, and one tile per upload. */
export function UploadTray({
  entries,
  folders,
  defaults,
  selected,
  editingKey,
  songTitle,
  onFolder,
  onPickSong,
  onToggle,
  onStartRename,
  onRename,
  onRetry,
  onCancelAll,
  onDismissDone,
  onReadd,
  onHeight,
}: {
  entries: UploadEntry[];
  folders: MediaFolder[];
  defaults: GigDefaults;
  selected: Set<string>;
  editingKey: string | null;
  songTitle: (id: string | null) => string | null;
  onFolder: (folderId: string | null) => void;
  onPickSong: () => void;
  onToggle: (key: string) => void;
  onStartRename: (key: string) => void;
  onRename: (key: string, name: string | null) => void;
  onRetry: (key: string) => void;
  onCancelAll: () => void;
  onDismissDone: () => void;
  onReadd: () => void;
  onHeight: (px: number) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = entries.filter(
    (e) => e.status === "queued" || e.status === "uploading",
  );
  const counted = entries.filter(
    (e) => e.status !== "readd" && e.status !== "error" && !e.restored,
  );
  const total = counted.reduce((n, e) => n + e.totalBytes, 0);
  const sent = counted.reduce((n, e) => n + e.sent, 0);
  const batch = total > 0 ? Math.min(1, sent / total) : 0;
  const hasReadd = entries.some((e) => e.status === "readd");
  const hasDone = entries.some((e) => e.status === "done" && e.restored);
  const cancellable = entries.some((e) => e.status !== "done");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    onHeight(el.offsetHeight);
    return () => {
      ro.disconnect();
      onHeight(0);
    };
  }, [onHeight]);

  const song = songTitle(defaults.songId);
  return (
    <div
      ref={root}
      data-testid="upload-tray"
      role="region"
      aria-label="Uploads"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background shadow-lift",
        "animate-in duration-300 slide-in-from-bottom",
      )}
    >
      <div
        role="progressbar"
        aria-label="Batch progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(batch * 100)}
        data-testid="upload-batch"
        className="absolute inset-x-0 top-0 h-1 bg-transparent"
      >
        <div
          className="h-full bg-blue-500 transition-[width] duration-300 ease-linear"
          style={{ width: `${batch * 100}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 pt-2.5 pb-1">
        <select
          aria-label="Upload folder"
          data-testid="upload-folder"
          value={defaults.folderId ?? ""}
          onChange={(e) => onFolder(e.target.value || null)}
          className="h-9 min-w-0 max-w-[38%] rounded-full border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Unsorted</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          data-testid="upload-song-pick"
          onClick={onPickSong}
          className="min-w-0 max-w-[38%] rounded-full"
        >
          <Music2 />
          <span className="truncate">{song ?? "Link song"}</span>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {hasReadd ? (
            <Button
              variant="secondary"
              size="sm"
              data-testid="upload-readd-pick"
              onClick={onReadd}
            >
              <Plus /> Re-add
            </Button>
          ) : null}
          {active.length === 0 && hasDone ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="upload-dismiss"
              onClick={onDismissDone}
            >
              Dismiss
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel all uploads"
              data-testid="upload-cancel-all"
              onClick={() => setConfirm(true)}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      {active.length > 0 ? (
        <p
          data-testid="upload-keep-open"
          className="mx-auto max-w-5xl px-3 text-xs text-muted-foreground"
        >
          Keep this page open until uploads finish
        </p>
      ) : null}
      <ul
        data-testid="upload-list"
        className="mx-auto flex max-w-5xl gap-3 overflow-x-auto px-4 pt-2.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      >
        {entries.map((e) => (
          <UploadTile
            key={e.key}
            entry={e}
            selected={selected.has(e.key)}
            editing={editingKey === e.key}
            songTitle={songTitle(e.songId)}
            onToggle={() => onToggle(e.key)}
            onStartRename={() => onStartRename(e.key)}
            onRename={(name) => onRename(e.key, name)}
            onRetry={() => onRetry(e.key)}
          />
        ))}
      </ul>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel all uploads?"
        description="Unfinished uploads will be stopped and discarded. Finished files stay in the gallery."
        confirmLabel="Cancel uploads"
        destructive
        onConfirm={() => {
          setConfirm(false);
          onCancelAll();
        }}
      />
    </div>
  );
}
