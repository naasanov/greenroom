"use client";

import { Check, ListMusic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { connectSpotify, useSpotifyStatus } from "@/lib/queries/spotify";
import {
  useImportProgress,
  useSongs,
  useStartImport,
} from "@/lib/queries/songs";
import { useDebounced } from "./use-debounced";

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

/** Read-only search over songs already in the band's library. */
function LibrarySearch({ bandId }: { bandId: string }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 200);
  const songs = useSongs(bandId, { q: debounced, sort: "title" });
  const rows = songs.data ?? [];
  return (
    <div className="flex flex-col gap-3" data-testid="import-library">
      <Input
        autoFocus
        aria-label="Search your library"
        placeholder="Search by title or artist"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul
        className="flex max-h-64 flex-col overflow-y-auto"
        data-testid="import-library-results"
      >
        {rows.map((s) => (
          <li key={s.id} className="flex flex-col py-1.5 text-sm">
            <span className="font-medium">{s.title}</span>
            {s.artist ? (
              <span className="text-muted-foreground">{s.artist}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {songs.isSuccess && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No songs in your library match.
        </p>
      ) : null}
    </div>
  );
}

function ConnectPrompt({
  url,
  notice,
  onCancel,
}: {
  url: string;
  notice?: string;
  onCancel: () => void;
}) {
  const target = url.trim() ? `?import=${encodeURIComponent(url.trim())}` : "";
  return (
    <div className="flex flex-col gap-4" data-testid="import-connect">
      <p className="text-base font-medium">
        Connect Spotify to import playlists
      </p>
      <p className="text-sm text-muted-foreground">
        Spotify only shares playlist contents with a signed-in account, so you
        need to connect yours once. You can also connect Spotify in settings.
        Private playlists can only be imported from the account that owns them.
      </p>
      {notice ? (
        <p
          role="alert"
          data-testid="import-connect-error"
          className="text-sm text-destructive"
        >
          {notice}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => connectSpotify(`/library${target}`)}>
          Connect Spotify
        </Button>
      </div>
    </div>
  );
}

function ImportBody({
  bandId,
  initialUrl,
  autoStart,
  connectError,
  onDone,
}: {
  bandId: string;
  initialUrl: string;
  autoStart: boolean;
  connectError: boolean;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [importId, setImportId] = useState<string | null>(null);
  const start = useStartImport(bandId);
  const progress = useImportProgress(bandId, importId);
  const data = progress.data;
  const finished = data?.status === "completed" || data?.status === "failed";

  const status = useSpotifyStatus();
  const [needsLogin, setNeedsLogin] = useState(connectError);
  const startedRef = useRef(false);
  const begin = (value: string) =>
    start.mutate(value, {
      onSuccess: (p) => setImportId(p.importId),
      onError: (e) => {
        if (
          isApiError(e, 409) &&
          e.code === SONG_ERROR_CODES.spotifyLoginRequired
        ) {
          setNeedsLogin(true);
        }
      },
    });
  useEffect(() => {
    if (!autoStart || startedRef.current || !initialUrl.trim()) return;
    startedRef.current = true;
    begin(initialUrl.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [mode, setMode] = useState<"playlist" | "library">("playlist");
  const error = start.error;
  const missing = isApiError(error, 404);
  const forbidden = isApiError(error, 403);

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

  if (needsLogin) {
    return (
      <ConnectPrompt
        url={url}
        notice={
          connectError ? "Couldn't connect Spotify. Try again." : undefined
        }
        onCancel={onDone}
      />
    );
  }

  const toggle = (
    <div className="flex gap-2" role="group" aria-label="Import source">
      <Button
        type="button"
        size="sm"
        variant={mode === "playlist" ? "default" : "outline"}
        aria-pressed={mode === "playlist"}
        onClick={() => setMode("playlist")}
      >
        Spotify playlist
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "library" ? "default" : "outline"}
        aria-pressed={mode === "library"}
        onClick={() => setMode("library")}
      >
        Your library
      </Button>
    </div>
  );

  if (mode === "library") {
    return (
      <div className="flex flex-col gap-3">
        {toggle}
        <LibrarySearch bandId={bandId} />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        if (status.data && !status.data.connected) {
          setNeedsLogin(true);
          return;
        }
        begin(url.trim());
      }}
    >
      {toggle}
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
          {forbidden
            ? "Spotify won't share this playlist with your account. Private playlists can only be imported from the account that owns them. You can manage your connection in settings."
            : missing
              ? "Can't find this playlist. Check the link, or connect Spotify in settings if it is private."
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
  autoStart = false,
  connectError = false,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  /** Starts the import as soon as the dialog opens (after a Spotify return). */
  autoStart?: boolean;
  /** Opens on the connect prompt with a failed-connection notice. */
  connectError?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Import playlist
          </DialogTitle>
          <DialogDescription>
            Paste a Spotify playlist link to add its songs (ones already in your
            library are skipped), or search the songs you already have.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ImportBody
            bandId={bandId}
            initialUrl={initialUrl}
            autoStart={autoStart}
            connectError={connectError}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
