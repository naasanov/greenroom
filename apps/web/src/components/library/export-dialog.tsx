"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  SONG_ERROR_CODES,
  YOUTUBE_ERROR_CODES,
  YOUTUBE_PLAYLIST_MAX,
  type ExportResult,
  type YoutubeExportResult,
} from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import { useSetlist } from "@/lib/queries/setlists";
import { useSongPool } from "@/lib/queries/songs";
import { pathWithout } from "@/lib/queries/spotify";
import {
  buildYoutubeQueue,
  connectSpotifyForExport,
  YOUTUBE_QUEUE_MAX,
  useExportToSpotify,
  type ExportTarget,
} from "@/lib/queries/spotify-export";
import {
  connectYoutube,
  useDisconnectYoutube,
  useExportToYoutube,
  useYoutubeStatus,
} from "@/lib/queries/youtube";

/** Query params the dialog adds to the Spotify and YouTube login return paths. */
export const EXPORT_PARAMS = [
  "spotify",
  "youtube",
  "export",
  "exportName",
] as const;

export interface ExportResume {
  provider: "spotify" | "youtube";
  state: "start" | "error";
  name: string;
}

/**
 * Reads the Spotify or YouTube login return (`spotify` or `youtube`, `export`,
 * `exportName`) for one export kind, clears those params from the URL, and
 * holds the resume state.
 */
export function useExportReturn(kind: "library" | "setlist") {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const provider = params.get("spotify") ? "spotify" : "youtube";
  const result = params.get(provider);
  const name = params.get("exportName") ?? "";
  const key =
    (result === "connected" || result === "error") &&
    params.get("export") === kind
      ? `${provider}|${result}|${name}`
      : null;
  const [handled, setHandled] = useState<string | null>(null);
  const [resume, setResume] = useState<ExportResume | null>(null);
  if (key !== handled && (key || handled)) {
    setHandled(key);
    if (key) {
      setResume({
        provider,
        state: result === "connected" ? "start" : "error",
        name,
      });
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
  service,
  onDone,
}: {
  result: ExportResult | YoutubeExportResult;
  service: "Spotify" | "YouTube";
  onDone: () => void;
}) {
  const { exported, skipped } = result;
  const leftOut = "leftOut" in result ? result.leftOut : 0;
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
            {`Skipped ${skipped.length} ${
              skipped.length === 1 ? "song" : "songs"
            } without a ${service} link.`}
          </p>
        ) : null}
        {leftOut > 0 ? (
          <p
            data-testid="export-left-out"
            className="text-sm text-muted-foreground"
          >
            {`Playlists hold ${YOUTUBE_PLAYLIST_MAX} songs. Left out ${leftOut}.`}
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
            Open in {service}
          </a>
        </Button>
      </div>
    </div>
  );
}

/** Writes plain text to the clipboard, falling back to a hidden textarea. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Copies one "Title - Artist" line per song as plain text. */
function CopyListButton({ lines }: { lines: string[] }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    const ok = await writeClipboard(lines.join("\n"));
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="export-copy"
      disabled={lines.length === 0}
      onClick={() => void copy()}
    >
      {state === "copied" ? <Check /> : <ClipboardCopy />}
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed"
          : "Copy to clipboard"}
    </Button>
  );
}

function useExportRows(bandId: string, target: ExportTarget) {
  const library = useSongPool(
    bandId,
    target.kind === "library" ? target.sort : "recent",
    target.kind === "library",
  );
  const setlist = useSetlist(
    bandId,
    target.kind === "setlist" ? target.setlistId : undefined,
  );
  return target.kind === "library"
    ? (library.data ?? [])
    : (setlist.data?.items ?? []);
}

/** Opens the songs with a YouTube or YouTube Music link as a temporary queue, no login needed. */
function YoutubeQueueButton({ url }: { url: string | null }) {
  const open = () => {
    if (!url) return;
    const tab = window.open(url, "_blank");
    if (tab) tab.opener = null;
  };
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="export-youtube-open"
      disabled={!url}
      onClick={open}
    >
      Export to YouTube
    </Button>
  );
}

/** The saved-playlist prompt: connect YouTube, or the connected account with a way out. */
function YoutubeAccount({
  connected,
  displayName,
  justConnected,
  failed,
  busy,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  displayName: string | null;
  justConnected: boolean;
  failed: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (connected) {
    return (
      <div
        data-testid="export-youtube-account"
        className="flex flex-col gap-1 border-t pt-4"
      >
        {justConnected ? (
          <p
            role="status"
            data-testid="export-youtube-connected"
            className="text-sm font-medium"
          >
            YouTube connected.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {displayName
              ? `Saving playlists to YouTube as ${displayName}.`
              : "Saving playlists to your YouTube account."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="export-youtube-disconnect"
            disabled={busy}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid="export-youtube-connect"
      className="flex flex-col gap-2 border-t pt-4"
    >
      <p className="text-sm font-medium">
        Save as a playlist in your YouTube account
      </p>
      <p className="text-sm text-muted-foreground">
        Connect YouTube once to keep the playlist instead of a temporary queue.
      </p>
      {failed ? (
        <p
          role="alert"
          data-testid="export-youtube-connect-error"
          className="text-sm text-destructive"
        >
          Couldn&apos;t connect YouTube. Try again.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        data-testid="export-youtube-connect-button"
        disabled={busy}
        onClick={onConnect}
      >
        Connect YouTube
      </Button>
    </div>
  );
}

function youtubeErrorMessage(error: unknown): string {
  if (
    isApiError(error, 503) &&
    error.code === YOUTUBE_ERROR_CODES.quotaExceeded
  ) {
    return "YouTube's daily limit for Greenroom has been reached, so the playlist could not be saved. Try again tomorrow, or use Export to YouTube to open a temporary queue.";
  }
  if (isApiError(error, 409)) {
    if (error.code === YOUTUBE_ERROR_CODES.loginRequired) {
      return "Your YouTube connection is no longer valid. Connect YouTube again to save playlists.";
    }
    if (error.code === YOUTUBE_ERROR_CODES.noChannel) {
      return "That Google account has no YouTube channel. Create one on YouTube, then try again.";
    }
  }
  if (
    isApiError(error, 422) &&
    error.code === SONG_ERROR_CODES.nothingToExport
  ) {
    return "None of these songs have a YouTube link, so there is nothing to save.";
  }
  return "Could not save to YouTube. Please try again.";
}

function ExportBody({
  bandId,
  target,
  defaultName,
  returnTo,
  resume,
  onDone,
}: {
  bandId: string;
  target: ExportTarget;
  defaultName: string;
  returnTo: string;
  resume: ExportResume | null;
  onDone: () => void;
}) {
  const autoStart = resume?.provider === "spotify" && resume.state === "start";
  const connectError =
    resume?.provider === "spotify" && resume.state === "error";
  const youtubeReturn = resume?.provider === "youtube" ? resume.state : null;
  const [name, setName] = useState(defaultName);
  const [needsLogin, setNeedsLogin] = useState<"connect" | "reconnect" | null>(
    connectError ? "connect" : null,
  );
  const rows = useExportRows(bandId, target);
  const copyLines = rows.map((s) =>
    s.artist ? `${s.title} - ${s.artist}` : s.title,
  );
  const queue = buildYoutubeQueue(rows);
  const exportMutation = useExportToSpotify(bandId);
  const youtubeExport = useExportToYoutube(bandId);
  const youtubeStatus = useYoutubeStatus();
  const disconnectYoutube = useDisconnectYoutube();
  const [youtubeConnectFailed, setYoutubeConnectFailed] = useState(
    youtubeReturn === "error",
  );
  const startedRef = useRef(false);
  const busy =
    exportMutation.isPending ||
    youtubeExport.isPending ||
    disconnectYoutube.isPending;

  const run = (value: string) =>
    exportMutation.mutate(
      { target, name: value },
      {
        onError: (e) => {
          if (!isApiError(e, 409)) return;
          if (e.code === SONG_ERROR_CODES.spotifyReconnectRequired) {
            setNeedsLogin("reconnect");
          } else if (e.code === SONG_ERROR_CODES.spotifyLoginRequired) {
            setNeedsLogin("connect");
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
    return (
      <Result result={exportMutation.data} service="Spotify" onDone={onDone} />
    );
  }
  if (youtubeExport.data) {
    return (
      <Result result={youtubeExport.data} service="YouTube" onDone={onDone} />
    );
  }

  if (needsLogin) {
    return (
      <div className="flex flex-col gap-4" data-testid="export-connect">
        <p className="text-base font-medium">
          {needsLogin === "reconnect"
            ? "Reconnect Spotify to grant playlist access"
            : "Connect Spotify to export playlists"}
        </p>
        <p className="text-sm text-muted-foreground">
          {needsLogin === "reconnect"
            ? "Your Spotify connection was made before playlist exports existed. Reconnect once to let Greenroom create playlists in your account."
            : "Greenroom needs your permission to create playlists in your Spotify account. You only need to do this once."}
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
            {needsLogin === "reconnect"
              ? "Reconnect Spotify"
              : "Connect Spotify"}
          </Button>
        </div>
        <div
          aria-hidden="true"
          data-testid="export-connect-divider"
          className="flex items-center gap-3 text-xs text-muted-foreground uppercase"
        >
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <div
          data-testid="export-connect-copy"
          className="flex flex-col sm:flex-row sm:justify-end"
        >
          <CopyListButton lines={copyLines} />
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
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-3"
        data-testid="export-spotify"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run(name.trim());
        }}
      >
        <FormField label="Playlist name" htmlFor="export-playlist-name">
          <Input
            id="export-playlist-name"
            autoFocus
            autoComplete="off"
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              exportMutation.reset();
              youtubeExport.reset();
            }}
          />
        </FormField>
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
        {youtubeExport.isError ? (
          <p
            role="alert"
            data-testid="export-youtube-error"
            className="text-sm text-destructive"
          >
            {youtubeErrorMessage(youtubeExport.error)}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={!name.trim() || busy}
          >
            {exportMutation.isPending ? "Exporting..." : "Export to Spotify"}
          </Button>
          {youtubeStatus.data?.connected ? (
            <Button
              type="button"
              variant="outline"
              data-testid="export-youtube-save"
              disabled={!name.trim() || busy}
              onClick={() => {
                exportMutation.reset();
                youtubeExport.mutate({ target, name: name.trim() });
              }}
            >
              {youtubeExport.isPending ? "Saving..." : "Save to YouTube"}
            </Button>
          ) : null}
          <YoutubeQueueButton url={queue.url} />
        </div>
        <p data-testid="export-note" className="text-sm text-muted-foreground">
          Songs without a Spotify or YouTube link are skipped.
        </p>
        {queue.overflow.length > 0 ? (
          <p
            data-testid="export-youtube-overflow"
            className="text-sm text-muted-foreground"
          >
            {`YouTube queues hold ${YOUTUBE_QUEUE_MAX} songs. Left out ${queue.overflow.length}.`}
          </p>
        ) : null}
      </form>
      {youtubeStatus.data ? (
        <YoutubeAccount
          connected={youtubeStatus.data.connected}
          displayName={youtubeStatus.data.displayName}
          justConnected={youtubeReturn === "start"}
          failed={youtubeConnectFailed}
          busy={busy}
          onConnect={() => {
            setYoutubeConnectFailed(false);
            connectYoutube(returnPath(returnTo, target.kind, name.trim()));
          }}
          onDisconnect={() => disconnectYoutube.mutate()}
        />
      ) : null}
      <div className="border-t pt-5">
        <CopyListButton lines={copyLines} />
      </div>
    </div>
  );
}

/** Name a new private playlist, export it to Spotify or YouTube, and read the summary. */
export function ExportDialog({
  bandId,
  open,
  onOpenChange,
  target,
  defaultName,
  returnTo,
  resume = null,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ExportTarget;
  defaultName: string;
  /** Path (with its query) to come back to after the Spotify or YouTube login. */
  returnTo: string;
  /** The login return being resumed: a Spotify export, or a YouTube connect result. */
  resume?: ExportResume | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Export songs
          </DialogTitle>
        </DialogHeader>
        {open ? (
          <ExportBody
            bandId={bandId}
            target={target}
            defaultName={defaultName}
            returnTo={returnTo}
            resume={resume}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
