"use client";

import { Check, ClipboardCopy, ExternalLink } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  pathWithout,
  spotifyKey,
  useSpotifyStatus,
} from "@/lib/queries/spotify";
import {
  connectSpotifyForExport,
  hasExportLink,
  useExportToSpotify,
  type ExportProvider,
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
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="status"
        data-testid="export-summary"
        className="flex flex-col gap-2"
      >
        <p className="flex min-w-0 items-start gap-2 text-base font-medium">
          <Check className="mt-0.5 size-5 shrink-0 text-primary" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Exported {exported} {exported === 1 ? "song" : "songs"} to “
            {result.name}”.
          </span>
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
      className="w-full min-w-0"
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

/** Copy to clipboard on its own row under an "or" divider. */
function CopyRow({ lines }: { lines: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="export-copy-row">
      <div
        aria-hidden="true"
        data-testid="export-copy-divider"
        className="flex items-center gap-3 text-xs text-muted-foreground uppercase"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <CopyListButton lines={lines} />
    </div>
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
  const query = target.kind === "library" ? library : setlist;
  const rows =
    target.kind === "library"
      ? (library.data ?? [])
      : (setlist.data?.items ?? []);
  return { rows, loading: query.isPending };
}

const SERVICE_NAME: Record<ExportProvider, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
};

/**
 * One provider's export action: the export button when connected (it reports
 * a missing link instead of calling the API), else a connect button. A submit
 * button leaves the export to the form's submit handler.
 */
function ProviderAction({
  provider,
  status,
  hasLinks,
  disabled,
  busy,
  pending,
  submit = false,
  onExport,
  onConnect,
  children,
}: {
  provider: ExportProvider;
  status: "loading" | "connected" | "disconnected";
  hasLinks: boolean;
  /** The export button is unavailable (no name yet, or another request runs). */
  disabled: boolean;
  /** Any request is running, which also holds the connect button. */
  busy: boolean;
  pending: boolean;
  submit?: boolean;
  onExport: () => void;
  onConnect: () => void;
  /** Messages shown under the button. */
  children?: ReactNode;
}) {
  const service = SERVICE_NAME[provider];
  const [attempted, setAttempted] = useState(false);
  const [seen, setSeen] = useState({ status, hasLinks });
  if (seen.status !== status || seen.hasLinks !== hasLinks) {
    setSeen({ status, hasLinks });
    setAttempted(false);
  }
  return (
    <div
      data-testid={`export-${provider}-action`}
      className="flex min-w-0 flex-col gap-2"
    >
      {status === "disconnected" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full min-w-0"
          data-testid={`export-${provider}-connect-button`}
          disabled={busy}
          onClick={onConnect}
        >
          {`Connect to ${service} to export`}
          <ExternalLink />
        </Button>
      ) : (
        <Button
          type={submit ? "submit" : "button"}
          variant="outline"
          className="w-full min-w-0"
          data-testid={`export-${provider}-button`}
          disabled={status === "loading" || disabled}
          onClick={() => {
            if (!hasLinks) setAttempted(true);
            else if (!submit) onExport();
          }}
        >
          {pending ? "Exporting..." : `Export to ${service}`}
        </Button>
      )}
      {status === "connected" && attempted && !hasLinks ? (
        <p
          role="alert"
          data-testid={`export-${provider}-no-link`}
          className="text-sm text-destructive"
        >
          {`No songs with a ${service} link`}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** The connected YouTube account with a way out. */
function YoutubeAccount({
  displayName,
  justConnected,
  busy,
  onDisconnect,
}: {
  displayName: string | null;
  justConnected: boolean;
  busy: boolean;
  onDisconnect: () => void;
}) {
  return (
    <div
      data-testid="export-youtube-account"
      className="flex min-w-0 flex-col gap-1"
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
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {displayName
            ? `Saving playlists to YouTube as ${displayName}.`
            : "Saving playlists to your YouTube account."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
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

function errorText(message: string, testId: string) {
  return (
    <p role="alert" data-testid={testId} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function youtubeErrorMessage(error: unknown): string {
  if (
    isApiError(error, 503) &&
    error.code === YOUTUBE_ERROR_CODES.quotaExceeded
  ) {
    return "YouTube's daily limit for Greenroom has been reached, so the playlist could not be saved. Try again tomorrow.";
  }
  if (isApiError(error, 409)) {
    if (error.code === YOUTUBE_ERROR_CODES.loginRequired) {
      return "Your YouTube connection is no longer valid. Connect YouTube again to export playlists.";
    }
    if (error.code === YOUTUBE_ERROR_CODES.noChannel) {
      return "That Google account has no YouTube channel. Create one on YouTube, then try again.";
    }
  }
  if (
    isApiError(error, 422) &&
    error.code === SONG_ERROR_CODES.nothingToExport
  ) {
    return "No songs with a YouTube link";
  }
  return "Could not save to YouTube. Please try again.";
}

function spotifyErrorMessage(error: unknown): string {
  return isApiError(error, 422) &&
    error.code === SONG_ERROR_CODES.nothingToExport
    ? "No songs with a Spotify link"
    : "Could not export to Spotify. Please try again.";
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
  const youtubeReturn = resume?.provider === "youtube" ? resume.state : null;
  const qc = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [spotifyConnectFailed, setSpotifyConnectFailed] = useState(
    resume?.provider === "spotify" && resume.state === "error",
  );
  const { rows, loading: rowsLoading } = useExportRows(bandId, target);
  const copyLines = rows.map((s) =>
    s.artist ? `${s.title} - ${s.artist}` : s.title,
  );
  const hasSpotifyLinks = rows.some((s) => hasExportLink("spotify", s));
  const hasYoutubeLinks = rows.some((s) => hasExportLink("youtube", s));
  const exportMutation = useExportToSpotify(bandId);
  const youtubeExport = useExportToYoutube(bandId);
  const spotifyStatus = useSpotifyStatus();
  const youtubeStatus = useYoutubeStatus();
  const disconnectYoutube = useDisconnectYoutube();
  const [youtubeConnectFailed, setYoutubeConnectFailed] = useState(
    youtubeReturn === "error",
  );
  const startedRef = useRef(false);
  const spotifyInFlight = useRef(false);
  const busy =
    exportMutation.isPending ||
    youtubeExport.isPending ||
    disconnectYoutube.isPending;
  const statusOf = (query: {
    isPending: boolean;
    data?: { connected: boolean };
  }) =>
    query.isPending
      ? "loading"
      : query.data?.connected
        ? "connected"
        : "disconnected";
  const spotifyState = statusOf(spotifyStatus);
  const youtubeState = statusOf(youtubeStatus);
  const nameOk = !!name.trim();

  const run = (value: string) => {
    if (spotifyInFlight.current) return;
    spotifyInFlight.current = true;
    exportMutation.mutate(
      { target, name: value },
      {
        onSettled: () => {
          spotifyInFlight.current = false;
        },
        onError: (e) => {
          if (!isApiError(e, 409)) return;
          if (e.code === SONG_ERROR_CODES.spotifyReconnectRequired) {
            setNeedsReconnect(true);
          } else if (e.code === SONG_ERROR_CODES.spotifyLoginRequired) {
            void qc.invalidateQueries({ queryKey: spotifyKey });
          }
        },
      },
    );
  };
  const connectReturnPath = () =>
    returnPath(returnTo, target.kind, name.trim());

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

  if (needsReconnect) {
    return (
      <div className="flex min-w-0 flex-col gap-4" data-testid="export-connect">
        <p className="text-base font-medium">
          Reconnect Spotify to grant playlist access
        </p>
        <p className="text-sm text-muted-foreground">
          Your Spotify connection was made before playlist exports existed.
          Reconnect once to let Greenroom create playlists in your account.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => connectSpotifyForExport(connectReturnPath())}>
            Reconnect Spotify
          </Button>
        </div>
        <CopyRow lines={copyLines} />
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

  const anyExportable =
    (spotifyState === "connected" && hasSpotifyLinks) ||
    (youtubeState === "connected" && hasYoutubeLinks);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form
        className="flex min-w-0 flex-col gap-4"
        data-testid="export-spotify"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            nameOk &&
            !busy &&
            !rowsLoading &&
            spotifyState === "connected" &&
            hasSpotifyLinks
          ) {
            run(name.trim());
          }
        }}
      >
        <FormField
          label="Playlist name"
          htmlFor="export-playlist-name"
          className="min-w-0"
        >
          <Input
            id="export-playlist-name"
            className="w-full min-w-0"
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
        <ProviderAction
          provider="spotify"
          status={spotifyState}
          hasLinks={hasSpotifyLinks}
          disabled={!nameOk || busy || rowsLoading}
          busy={busy}
          pending={exportMutation.isPending}
          submit
          onExport={() => run(name.trim())}
          onConnect={() => {
            setSpotifyConnectFailed(false);
            connectSpotifyForExport(connectReturnPath());
          }}
        >
          {spotifyState === "disconnected" && spotifyConnectFailed
            ? errorText(
                "Couldn't connect Spotify. Try again.",
                "export-connect-error",
              )
            : null}
          {exportMutation.isError
            ? errorText(
                spotifyErrorMessage(exportMutation.error),
                "export-error",
              )
            : null}
        </ProviderAction>
        <ProviderAction
          provider="youtube"
          status={youtubeState}
          hasLinks={hasYoutubeLinks}
          disabled={!nameOk || busy || rowsLoading}
          busy={busy}
          pending={youtubeExport.isPending}
          onExport={() => {
            exportMutation.reset();
            youtubeExport.mutate({ target, name: name.trim() });
          }}
          onConnect={() => {
            setYoutubeConnectFailed(false);
            connectYoutube(connectReturnPath());
          }}
        >
          {youtubeState === "disconnected" && youtubeConnectFailed
            ? errorText(
                "Couldn't connect YouTube. Try again.",
                "export-youtube-connect-error",
              )
            : null}
          {youtubeExport.isError
            ? errorText(
                youtubeErrorMessage(youtubeExport.error),
                "export-youtube-error",
              )
            : null}
          {youtubeState === "connected" ? (
            <YoutubeAccount
              displayName={youtubeStatus.data?.displayName ?? null}
              justConnected={youtubeReturn === "start"}
              busy={busy}
              onDisconnect={() => disconnectYoutube.mutate()}
            />
          ) : null}
        </ProviderAction>
        {anyExportable ? (
          <p
            data-testid="export-note"
            className="text-sm text-muted-foreground"
          >
            Songs without a Spotify or YouTube link are skipped.
          </p>
        ) : null}
      </form>
      <CopyRow lines={copyLines} />
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
      <DialogContent
        aria-describedby={undefined}
        className="grid-cols-[minmax(0,1fr)]"
      >
        <DialogHeader className="min-w-0">
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
