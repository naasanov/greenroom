"use client";

import {
  Download,
  ExternalLink,
  Link2,
  FolderInput,
  HardDrive,
  Music2,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { FileEntry } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { driveOpenUrl, isGoogleDoc, isProtected } from "./file-utils";

export interface EntryActions {
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onLinkSongs: (entry: FileEntry) => void;
  onLinkGig: (entry: FileEntry) => void;
  onCopyLink: (entry: FileEntry) => void;
  onTrash: (entry: FileEntry) => void;
}

/**
 * Kebab menu for one entry; also opened by right-click through `open`.
 * `viewer` restyles the trigger for the dark file viewer and drops the actions its toolbar already has.
 */
export function ItemMenu({
  entry,
  open,
  onOpenChange,
  actions,
  viewer = false,
}: {
  entry: FileEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: EntryActions;
  viewer?: boolean;
}) {
  const locked = isProtected(entry);
  const canLinkGig = entry.kind === "folder" && !locked;
  const canDownload = entry.kind === "file" && !isGoogleDoc(entry);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            viewer
              ? "More actions"
              : `Actions for ${entry.gig?.title ?? entry.name}`
          }
          data-testid={viewer ? "viewer-menu" : undefined}
          className={
            viewer
              ? "text-white hover:bg-white/15 hover:text-white"
              : "text-muted-foreground"
          }
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {viewer ? null : (
          <>
            <DropdownMenuItem onSelect={() => actions.onOpen(entry)}>
              <ExternalLink /> Open
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={driveOpenUrl(entry)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <HardDrive /> Open in Drive
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={() => actions.onRename(entry)}>
          <Pencil /> Rename
        </DropdownMenuItem>
        {canDownload && !viewer ? (
          <DropdownMenuItem onSelect={() => actions.onDownload(entry)}>
            <Download /> Download
          </DropdownMenuItem>
        ) : null}
        {canDownload ? (
          <DropdownMenuItem onSelect={() => actions.onCopyLink(entry)}>
            <Link2 /> Copy link
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => actions.onLinkSongs(entry)}>
          <Music2 /> Link to songs
        </DropdownMenuItem>
        {canLinkGig ? (
          <DropdownMenuItem onSelect={() => actions.onLinkGig(entry)}>
            <FolderInput /> Link to gig
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {locked ? (
          <>
            <DropdownMenuItem disabled variant="destructive">
              <Trash2 /> Move to trash
            </DropdownMenuItem>
            <p
              data-testid="trash-locked-hint"
              className="px-2.5 pb-2 text-xs text-muted-foreground"
            >
              {entry.gig
                ? "Delete the gig to remove its folder"
                : "The gigs folder can't be deleted"}
            </p>
          </>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => actions.onTrash(entry)}
          >
            <Trash2 /> Move to trash
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
