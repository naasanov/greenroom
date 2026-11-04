"use client";

import { useState } from "react";
import { FILES_ERROR_CODES } from "@greenroom/shared";
import { FolderPickerDialog } from "@/components/google/folder-picker-dialog";
import { isApiError } from "@/lib/api";
import { useLinkGigFolder } from "@/lib/queries/drive-browse";

function errorText(e: unknown): string {
  if (isApiError(e, 409)) {
    if (e.code === FILES_ERROR_CODES.gigAlreadyHasFolder) {
      return "This gig already has a Drive folder.";
    }
    if (e.code === FILES_ERROR_CODES.folderAlreadyLinked) {
      return "That folder is already linked to another gig.";
    }
  }
  if (isApiError(e, 422)) {
    return "That folder can't be used. Pick a different one inside your band folder.";
  }
  return "We could not link that folder. Please try again.";
}

/** Browses the Files tree and attaches the chosen folder to the gig as its media folder. */
export function LinkFolderDialog({
  bandId,
  gigId,
  open,
  onOpenChange,
}: {
  bandId: string;
  gigId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const link = useLinkGigFolder(bandId, gigId);
  const [error, setError] = useState<string | null>(null);
  return (
    <FolderPickerDialog
      bandId={bandId}
      open={open}
      onOpenChange={(o) => {
        if (o) setError(null);
        onOpenChange(o);
      }}
      title="Link an existing Drive folder"
      description="Its files and subfolders become this gig's media. Nothing is moved or renamed in Drive."
      confirmLabel="Link this folder"
      pending={link.isPending}
      error={error}
      onSelect={(id) => {
        setError(null);
        link.mutate(id, {
          onSuccess: () => onOpenChange(false),
          onError: (e) => setError(errorText(e)),
        });
      }}
    />
  );
}
