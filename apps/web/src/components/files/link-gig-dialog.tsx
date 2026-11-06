"use client";

import { useState } from "react";
import { FILES_ERROR_CODES, type FileEntry } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api";
import { useLinkGigFolder } from "@/lib/queries/drive-browse";
import { useEvents } from "@/lib/queries/events";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 180;

function errorText(e: unknown): string {
  if (isApiError(e, 409)) {
    if (e.code === FILES_ERROR_CODES.gigAlreadyHasFolder) {
      return "That gig already has a Drive folder.";
    }
    if (e.code === FILES_ERROR_CODES.folderAlreadyLinked) {
      return "This folder is already linked to another gig.";
    }
  }
  if (isApiError(e, 422)) return "That folder can't be linked to a gig.";
  return "We could not link that folder. Please try again.";
}

function GigRow({
  bandId,
  gigId,
  title,
  date,
  folderId,
  onLinked,
  onError,
}: {
  bandId: string;
  gigId: string;
  title: string;
  date: string;
  folderId: string;
  onLinked: () => void;
  onError: (message: string) => void;
}) {
  const link = useLinkGigFolder(bandId, gigId);
  return (
    <li>
      <Button
        variant="outline"
        className="h-auto min-h-11 w-full justify-between gap-3 py-2"
        disabled={link.isPending}
        onClick={() =>
          link.mutate(folderId, {
            onSuccess: onLinked,
            onError: (e) => onError(errorText(e)),
          })
        }
      >
        <span className="min-w-0 truncate">{title}</span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          {date}
        </span>
      </Button>
    </li>
  );
}

function GigList({
  bandId,
  folder,
  onLinked,
}: {
  bandId: string;
  folder: FileEntry;
  onLinked: () => void;
}) {
  const [range] = useState(() => {
    const day = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    return {
      from: new Date(day - WINDOW_DAYS * DAY_MS).toISOString(),
      to: new Date(day + WINDOW_DAYS * DAY_MS).toISOString(),
    };
  });
  const events = useEvents(bandId, range);
  const [error, setError] = useState<string | null>(null);
  const gigs = (events.data ?? []).filter((e) => e.type === "gig");

  if (events.isPending) {
    return <p className="text-sm text-muted-foreground">Loading gigs...</p>;
  }
  if (events.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        We could not load your gigs. Please try again.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {gigs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No gigs to link to yet.</p>
      ) : (
        <ul
          data-testid="link-gig-list"
          className="flex max-h-72 flex-col gap-1.5 overflow-y-auto"
        >
          {gigs.map((g) => (
            <GigRow
              key={g.id}
              bandId={bandId}
              gigId={g.id}
              title={g.title}
              date={g.date}
              folderId={folder.id}
              onLinked={onLinked}
              onError={setError}
            />
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Picks a gig and attaches the chosen folder to it as the gig's media folder. */
export function LinkGigDialog({
  bandId,
  entry,
  onClose,
  onLinked,
}: {
  bandId: string;
  entry: FileEntry | null;
  onClose: () => void;
  onLinked: (gigFolderName: string) => void;
}) {
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="link-gig-dialog"
        className="max-h-[85dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Link to gig
          </DialogTitle>
          <DialogDescription>
            Its files and subfolders become the media for the gig you pick.
            Nothing in Drive is moved or renamed.
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <GigList
            key={shown.id}
            bandId={bandId}
            folder={shown}
            onLinked={() => onLinked(shown.name)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
