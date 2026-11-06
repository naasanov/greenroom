"use client";

import { ChevronRight, File as FileIcon, Folder, Loader2 } from "lucide-react";
import { useState } from "react";
import type { FileEntry } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFolderListing } from "@/lib/queries/drive-browse";

export interface FolderPickerDialogProps {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** "folder" picks the folder being viewed; "any" also picks files and listed folders. */
  mode?: "folder" | "any";
  /** Hides entries for which this returns false (folders stay navigable in folder mode). */
  filter?: (entry: FileEntry) => boolean;
  onSelect: (id: string, name: string, entry?: FileEntry) => void;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
}

/** Browses the band's Files tree with breadcrumbs and picks a folder (or any file). */
export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  ...rest
}: FolderPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="folder-picker"
        className="z-[60] pointer-events-auto! max-h-[85dvh] overflow-y-auto"
        // Keeps drawers underneath from treating clicks here as outside clicks.
        onPointerDown={(e) => e.stopPropagation()}
        // Focus lands on the dialog itself so the close button shows no ring on open.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Open folders to find the one you want."}
          </DialogDescription>
        </DialogHeader>
        <Browser {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function Browser({
  bandId,
  mode = "folder",
  filter,
  onSelect,
  confirmLabel,
  pending,
  error,
}: Omit<FolderPickerDialogProps, "open" | "onOpenChange" | "title">) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const listing = useFolderListing(bandId, folderId);
  const any = mode === "any";

  if (listing.isPending) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Loading folders...
      </p>
    );
  }
  if (listing.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        We could not load that folder. Please try again.
      </p>
    );
  }

  const { folder, breadcrumbs, items, truncated } = listing.data;
  const shown = items.filter(
    (e) => (any || e.kind === "folder") && (!filter || filter(e)),
  );

  return (
    <div className="flex flex-col gap-3">
      <nav
        aria-label="Breadcrumbs"
        className="flex flex-wrap items-center gap-1 text-sm"
      >
        {breadcrumbs.map((b, i) => {
          const last = i === breadcrumbs.length - 1;
          return (
            <span key={b.id} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="size-3 text-muted-foreground" />
              ) : null}
              {last ? (
                <span aria-current="page" className="font-medium">
                  {b.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => setFolderId(i === 0 ? null : b.id)}
                >
                  {b.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {any ? "Nothing in this folder." : "No folders in here."}
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {shown.map((e) => (
            <li key={e.id} className="flex gap-1.5">
              {e.kind === "folder" ? (
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 justify-start"
                  onClick={() => setFolderId(e.id)}
                >
                  <Folder />
                  <span className="truncate">{e.name}</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 justify-start"
                  aria-label={`Select ${e.name}`}
                  disabled={pending}
                  onClick={() => onSelect(e.id, e.name, e)}
                >
                  <FileIcon />
                  <span className="truncate">{e.name}</span>
                </Button>
              )}
              {any && e.kind === "folder" ? (
                <Button
                  variant="secondary"
                  aria-label={`Select ${e.name}`}
                  disabled={pending}
                  onClick={() => onSelect(e.id, e.name, e)}
                >
                  Select
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Only the first entries are shown.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!any ? (
        <Button
          data-testid="folder-picker-select"
          disabled={folder.isRoot || pending}
          onClick={() => onSelect(folder.id, folder.name)}
        >
          {confirmLabel ?? "Select this folder"}
        </Button>
      ) : null}
    </div>
  );
}
