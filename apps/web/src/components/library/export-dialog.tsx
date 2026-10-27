"use client";

import { Check } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SONG_ERROR_CODES, type ExportResult } from "@greenroom/shared";
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
import { pathWithout } from "@/lib/queries/spotify";
import {
  connectSpotifyForExport,
  useExportToSpotify,
  type ExportTarget,
} from "@/lib/queries/spotify-export";

/** Query params the dialog adds to the Spotify login return path. */
export const EXPORT_PARAMS = ["spotify", "export", "exportName"] as const;

export interface ExportResume {
  state: "start" | "error";
  name: string;
}

/**
 * Reads the Spotify login return (`spotify`, `export`, `exportName`) for one
 * export kind, clears those params from the URL, and holds the resume state.
 */
export function useExportReturn(kind: "library" | "setlist") {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const spotify = params.get("spotify");
  const name = params.get("exportName") ?? "";
  const key =
    (spotify === "connected" || spotify === "error") &&
    params.get("export") === kind
      ? `${spotify}|${name}`
      : null;
  const [handled, setHandled] = useState<string | null>(null);
  const [resume, setResume] = useState<ExportResume | null>(null);
  if (key !== handled && (key || handled)) {
    setHandled(key);
    if (key) {
      setResume({ state: spotify === "connected" ? "start" : "error", name });
    }
  }
  useEffect(() => {
    if (key) router.replace(pathWithout(pathname, params, [...EXPORT_PARAMS]));
  }, [key, pathname, params, router]);
  return { resume, clear: () => setResume(null) };
}

function returnPath(base: string, kind: string, name: string): string {
  const url = new URL(base, "http://x");
  url.searchParams.set("export", kind);
  url.searchParams.set("exportName", name);
  return `${url.pathname}${url.search}`;
}

function Result({
  result,
  onDone,
}: {
  result: ExportResult;
  onDone: () => void;
}) {
  const { exported, skipped } = result;
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        data-testid="export-summary"
        className="flex flex-col gap-2"
      >
        <p className="flex items-start gap-2 text-base font-medium">
          <Check className="mt-0.5 size-5 shrink-0 text-primary" />
          Exported {exported} {exported === 1 ? "song" : "songs"} to “
          {result.name}”.
        </p>
        {skipped.length > 0 ? (
          <p
            data-testid="export-skipped"
            className="text-sm text-muted-foreground"
          >
            Skipped {skipped.length} without a Spotify link:{" "}
            {skipped.map((s) => s.title).join(", ")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
        <Button asChild>
          <a
            href={result.playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Spotify
          </a>
        </Button>
      </div>
    </div>
  );
}

function ExportBody({
  bandId,
  target,
  defaultName,
  returnTo,
  autoStart,
  connectError,
  onDone,
}: {
  bandId: string;
  target: ExportTarget;
  defaultName: string;
  returnTo: string;
  autoStart: boolean;
  connectError: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [needsLogin, setNeedsLogin] = useState(connectError);
  const exportMutation = useExportToSpotify(bandId);
  const startedRef = useRef(false);

  const run = (value: string) =>
    exportMutation.mutate(
      { target, name: value },
      {
        onError: (e) => {
          if (
            isApiError(e, 409) &&
            e.code === SONG_ERROR_CODES.spotifyLoginRequired
          ) {
            setNeedsLogin(true);
          }
        },
      },
    );

  useEffect(() => {
    if (!autoStart || startedRef.current || !defaultName.trim()) return;
    startedRef.current = true;
    run(defaultName.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (exportMutation.data) {
    return <Result result={exportMutation.data} onDone={onDone} />;
  }

  if (needsLogin) {
    return (
      <div className="flex flex-col gap-4" data-testid="export-connect">
        <p className="text-base font-medium">
          Connect Spotify to export playlists
        </p>
        <p className="text-sm text-muted-foreground">
          Greenroom needs your permission to create playlists in your Spotify
          account. You only need to do this once.
        </p>
        {connectError ? (
          <p
            role="alert"
            data-testid="export-connect-error"
            className="text-sm text-destructive"
          >
            Couldn&apos;t connect Spotify. Try again.
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              connectSpotifyForExport(
                returnPath(returnTo, target.kind, name.trim()),
              )
            }
          >
            Connect Spotify
          </Button>
        </div>
      </div>
    );
  }

  if (autoStart && !exportMutation.isError) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Exporting...
      </p>
    );
  }

  const error = exportMutation.error;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) run(name.trim());
      }}
    >
      <Input
        autoFocus
        aria-label="Playlist name"
        autoComplete="off"
        maxLength={100}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          exportMutation.reset();
        }}
      />
      {exportMutation.isError ? (
        <p
          role="alert"
          data-testid="export-error"
          className="text-sm text-destructive"
        >
          {isApiError(error, 422) &&
          error.code === SONG_ERROR_CODES.nothingToExport
            ? "None of these songs have a Spotify link, so there is nothing to export."
            : "Could not export to Spotify. Please try again."}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={!name.trim() || exportMutation.isPending}
      >
        {exportMutation.isPending ? "Exporting..." : "Export"}
      </Button>
    </form>
  );
}

/** Name a new private Spotify playlist, export to it, and read the summary. */
export function ExportDialog({
  bandId,
  open,
  onOpenChange,
  target,
  defaultName,
  returnTo,
  autoStart = false,
  connectError = false,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ExportTarget;
  defaultName: string;
  /** Path (with its query) to come back to after the Spotify login. */
  returnTo: string;
  /** Exports as soon as the dialog opens (after a Spotify return). */
  autoStart?: boolean;
  /** Opens on the connect prompt with a failed-connection notice. */
  connectError?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Export to Spotify
          </DialogTitle>
          <DialogDescription>
            Creates a new private playlist in your Spotify account. Songs
            without a Spotify link are skipped.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ExportBody
            bandId={bandId}
            target={target}
            defaultName={defaultName}
            returnTo={returnTo}
            autoStart={autoStart}
            connectError={connectError}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
