"use client";

import { FolderSearch, Loader2 } from "lucide-react";
import { useState } from "react";
import { FolderPickerDialog } from "@/components/google/folder-picker-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api";
import { useFolderListing, useSetGigsFolder } from "@/lib/queries/drive-browse";
import { useDriveStatus } from "@/lib/queries/google";

const CREATE = "create";

export const GIGS_ROOT_COPY =
  "New gig folders are created here. Existing folders stay put and nothing in Drive is moved or renamed. Folders in the gigs root are not gigs until you link them to one.";

/** Choose the folder where gig folders live: an existing child folder or a new "Gigs" folder. */
export function GigsRootStep({
  bandId,
  currentId,
  skipLabel,
  onDone,
}: {
  bandId: string;
  currentId: string | null;
  skipLabel?: string;
  onDone: () => void;
}) {
  const root = useFolderListing(bandId, null);
  const status = useDriveStatus(bandId, true);
  const setGigs = useSetGigsFolder(bandId);
  const [choice, setChoice] = useState<string>(currentId ?? CREATE);
  const [custom, setCustom] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photosId = status.data?.photosFolderId ?? null;
  const children = (root.data?.items ?? []).filter(
    (i) => i.kind === "folder" && i.id !== photosId,
  );
  const nestedCurrent =
    !!currentId && !!root.data && !children.some((c) => c.id === currentId);
  const nested = useFolderListing(bandId, currentId, nestedCurrent);
  const extra =
    custom ??
    (nestedCurrent && nested.data
      ? { id: currentId!, name: nested.data.folder.name }
      : null);
  const options = [
    ...children.map((c) => ({ id: c.id, name: c.name })),
    ...(extra && !children.some((c) => c.id === extra.id) ? [extra] : []),
  ];

  function confirm() {
    setError(null);
    if (choice === currentId) return onDone();
    setGigs.mutate(
      choice === CREATE ? { create: true } : { folderId: choice },
      {
        onSuccess: onDone,
        onError: (e) =>
          setError(
            isApiError(e) && e.code === "FILES_OUTSIDE_ROOT"
              ? "That folder is not inside your band folder."
              : "We could not change the gigs folder. Please try again.",
          ),
      },
    );
  }

  // Waits for fresh status so the Profile photos folder is never offered.
  if (root.isPending || status.isPending || status.isFetching) {
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

  return (
    <div data-testid="gigs-root-step" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{GIGS_ROOT_COPY}</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Gigs folder</legend>
        {options.map((o) => (
          <Choice
            key={o.id}
            value={o.id}
            label={o.name}
            checked={choice === o.id}
            onChange={setChoice}
          />
        ))}
        <Choice
          value={CREATE}
          label="Create a new Gigs folder"
          checked={choice === CREATE}
          onChange={setChoice}
        />
      </fieldset>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setBrowsing(true)}
      >
        <FolderSearch />
        Choose a different folder
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {skipLabel ? (
          <Button type="button" variant="outline" onClick={onDone}>
            {skipLabel}
          </Button>
        ) : null}
        <Button type="button" disabled={setGigs.isPending} onClick={confirm}>
          Confirm
        </Button>
      </div>
      <FolderPickerDialog
        bandId={bandId}
        open={browsing}
        onOpenChange={setBrowsing}
        title="Choose the gigs folder"
        onSelect={(id, name) => {
          setCustom({ id, name });
          setChoice(id);
          setBrowsing(false);
        }}
      />
    </div>
  );
}

function Choice({
  value,
  label,
  checked,
  onChange,
}: {
  value: string;
  label: string;
  checked: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm has-checked:border-primary">
      <input
        type="radio"
        name="gigs-root"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

/** Settings entry point: change the gigs folder later. */
export function GigsRootDialog({
  bandId,
  currentId,
  open,
  onOpenChange,
}: {
  bandId: string;
  currentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="gigs-root-dialog">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Where do your gigs go?
          </DialogTitle>
          <DialogDescription>
            Pick the folder that holds your gig folders.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GigsRootStep
            bandId={bandId}
            currentId={currentId}
            skipLabel="Cancel"
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
