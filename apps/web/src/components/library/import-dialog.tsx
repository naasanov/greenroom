"use client";

import { Check, ListMusic } from "lucide-react";
import { useState } from "react";
import type { ImportProgress } from "@greenroom/shared";
import { SONG_ERROR_CODES } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import { useImportProgress, useStartImport } from "@/lib/queries/songs";

function summary(p: ImportProgress): string {
  const parts = [`${p.added} added`, `${p.skipped} already in library`];
  if (p.failed > 0) parts.push(`${p.failed} failed`);
  return parts.join(", ");
}

function Progress({ progress }: { progress: ImportProgress | undefined }) {
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round(((progress?.done ?? 0) / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2" data-testid="import-progress">
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {total > 0
          ? `Importing ${progress?.done ?? 0} of ${total}...`
          : "Importing..."}
      </p>
    </div>
  );
}

function ImportBody({
  bandId,
  initialUrl,
  onDone,
}: {
  bandId: string;
  initialUrl: string;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [importId, setImportId] = useState<string | null>(null);
  const start = useStartImport(bandId);
  const progress = useImportProgress(bandId, importId);
  const data = progress.data;
  const finished = data?.status === "completed" || data?.status === "failed";

  const error = start.error;
  const privateOrMissing =
    isApiError(error, 404) &&
    (error.code === SONG_ERROR_CODES.playlistNotFound || !error.code);

  if (importId && data && finished) {
    const failed = data.status === "failed";
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          data-testid="import-summary"
          className="flex items-start gap-2 text-base font-medium"
        >
          {failed ? null : <Check className="mt-0.5 size-5 text-primary" />}
          {failed ? (data.error ?? "The import failed.") : summary(data)}
        </p>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  if (importId) return <Progress progress={data} />;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        start.mutate(url.trim(), { onSuccess: (p) => setImportId(p.importId) });
      }}
    >
      <Input
        autoFocus
        aria-label="Playlist link"
        placeholder="https://open.spotify.com/playlist/..."
        autoComplete="off"
        autoCapitalize="none"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          start.reset();
        }}
      />
      {start.isError ? (
        <p
          role="alert"
          data-testid="import-error"
          className="text-sm text-destructive"
        >
          {privateOrMissing
            ? "Can't see this playlist — it might be private"
            : isApiError(error, 400)
              ? "That doesn't look like a Spotify playlist link."
              : "Could not start the import. Please try again."}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={!url.trim() || start.isPending}>
        <ListMusic /> {start.isPending ? "Checking..." : "Import"}
      </Button>
    </form>
  );
}

/** Paste a playlist link, watch progress, and read the end summary. */
export function ImportDialog({
  bandId,
  open,
  onOpenChange,
  initialUrl = "",
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Import playlist
          </DialogTitle>
          <DialogDescription>
            Paste a Spotify playlist link. Songs already in your library are
            skipped.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ImportBody
            bandId={bandId}
            initialUrl={initialUrl}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
