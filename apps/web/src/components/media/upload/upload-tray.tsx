"use client";

import { CheckCheck, FolderInput, Music2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadEntry } from "./upload-store";
import { BatchBar, isActive } from "./upload-progress";
import { UploadTile } from "./upload-tile";

/** Thin bottom tray: batch bar, Select all / Folder / Song buttons, and one tile per upload. */
export function UploadTray({
  entries,
  hiddenKeys,
  selected,
  editingKey,
  songTitle,
  onSelectAll,
  onToggle,
  onStartRename,
  onRename,
  onRetry,
  onCancel,
  onPickFolder,
  onPickSong,
  onCancelAll,
  onDismissDone,
  onReadd,
  onHeight,
}: {
  entries: UploadEntry[];
  /** Entries shown in the gallery instead of the tray list. */
  hiddenKeys?: Set<string>;
  selected: Set<string>;
  editingKey: string | null;
  songTitle: (id: string | null) => string | null;
  onSelectAll: () => void;
  onToggle: (key: string) => void;
  onStartRename: (key: string) => void;
  onRename: (key: string, name: string | null) => void;
  onRetry: (key: string) => void;
  onCancel: (key: string) => void;
  /** Opens the folder / song picker for every tray entry. */
  onPickFolder: () => void;
  onPickSong: () => void;
  onCancelAll: () => void;
  onDismissDone: () => void;
  onReadd: () => void;
  onHeight: (px: number) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = entries.filter((e) => !hiddenKeys?.has(e.key));
  const active = visible.filter(isActive);
  const hasReadd = visible.some((e) => e.status === "readd");
  // Entries awaiting a re-pick cannot be moved or assigned, so only Re-add applies.
  const readdOnly =
    visible.length > 0 && visible.every((e) => e.status === "readd");
  const hasDone = visible.some((e) => e.status === "done");
  const cancellable = visible.some((e) => e.status !== "done");

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
      <BatchBar entries={entries} className="absolute inset-x-0 top-0" />
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-1">
        {readdOnly ? (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Pick the same files again to finish these uploads.
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="upload-select-all"
              onClick={onSelectAll}
              className="rounded-full"
            >
              <CheckCheck /> Select all
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="upload-folder"
              onClick={onPickFolder}
              className="rounded-full"
            >
              <FolderInput /> Folder
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="upload-song-pick"
              onClick={onPickSong}
              className="rounded-full"
            >
              <Music2 /> Song
            </Button>
          </>
        )}
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
          className="px-3 text-xs text-muted-foreground"
        >
          Keep this page open until uploads finish
        </p>
      ) : null}
      <ul
        data-testid="upload-list"
        className="flex gap-3 overflow-x-auto px-4 pt-2.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      >
        {visible.map((e) => (
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
            onCancel={() => onCancel(e.key)}
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
