"use client";

import { ChevronDown, Guitar, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  CHORD_ERROR_CODES,
  isUltimateGuitarUrl,
  type UgVersion,
} from "@greenroom/shared";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import {
  useChordSheet,
  useChordsIndex,
  useChordsSuggestion,
  useDeleteChords,
  useImportChords,
} from "@/lib/queries/chords";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChordsEditor } from "./chords-editor";
import { ChordsReader } from "./chords-reader";

interface SectionSong {
  id: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
}

const autoKey = (songId: string, url: string) =>
  `chords-auto-import:${songId}:${url}`;

function importMessage(error: unknown): string {
  return isApiError(error) && error.code === CHORD_ERROR_CODES.official
    ? "This is an Official/Pro tab, which can't be imported. Try a community version."
    : "Couldn't import chords from this link";
}

const versionText = (v: UgVersion) =>
  `${v.rating.toFixed(1)}, ${v.votes} ratings`;

/** The song sheet's chords area: the reader entry point, or ways to add a sheet. */
export function SongChordsSection({
  bandId,
  song,
  references,
}: {
  bandId: string;
  song: SectionSong;
  references: { value: string }[];
}) {
  const router = useRouter();
  const desktop = useMediaQuery("(min-width: 768px)");
  const index = useChordsIndex(bandId);
  const enabled = index.data?.enabled === true;
  const inIndex = index.data?.songIds.includes(song.id) ?? false;
  const sheetQuery = useChordSheet(bandId, song.id, enabled && inIndex);
  const sheet = sheetQuery.data;
  const hasSheet = !!sheet || inIndex;

  const importer = useImportChords(bandId, song.id);
  const remove = useDeleteChords(bandId, song.id);
  const [mode, setMode] = useState<"detail" | "reader" | "editor">("detail");
  const [adding, setAdding] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [failed, setFailed] = useState<{ url: string; message: string } | null>(
    null,
  );
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);

  const startImport = useCallback(
    (url: string) => {
      importer.mutate(url, {
        onSuccess: () => setAdding(false),
        onError: (e) => setFailed({ url, message: importMessage(e) }),
      });
    },
    // `mutate` is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importer.mutate],
  );
  const runImport = (url: string) => {
    setFailed(null);
    startImport(url);
  };

  const ugReference = references
    .map((r) => r.value.trim())
    .find(isUltimateGuitarUrl);
  const ready = enabled && !hasSheet;
  useEffect(() => {
    if (!ready || !ugReference) return;
    const key = autoKey(song.id, ugReference);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    startImport(ugReference);
  }, [ready, ugReference, song.id, startImport]);

  const suggestion = useChordsSuggestion(
    bandId,
    song.title,
    song.artist,
    ready && adding,
  );

  if (!enabled) return null;

  const openReader = () => {
    if (desktop) setMode("reader");
    else router.push(`/songs/${song.id}/chords`);
  };
  const close = () => setMode("detail");

  if (mode !== "detail") {
    return (
      <div
        data-testid="song-chords-panel"
        className="absolute inset-0 z-10 overflow-y-auto bg-card"
      >
        {mode === "editor" ? (
          <ChordsEditor
            bandId={bandId}
            songId={song.id}
            existing={sheet ?? null}
            onClose={close}
          />
        ) : sheet ? (
          <ChordsReader
            bandId={bandId}
            songId={song.id}
            title={song.title}
            artist={song.artist}
            durationSeconds={song.durationSeconds}
            sheet={sheet}
            variant="embedded"
            onClose={close}
          />
        ) : sheetQuery.isError ? (
          <div
            role="alert"
            data-testid="song-chords-load-error"
            className="flex flex-col items-center gap-3 py-10 text-sm text-destructive"
          >
            <span>Could not load the chords</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="song-chords-load-retry"
                onClick={() => void sheetQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  const errorBlock = failed ? (
    <div
      role="alert"
      data-testid="song-chords-error"
      className="flex flex-wrap items-center gap-2 text-sm text-destructive"
    >
      <span>{failed.message}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="song-chords-retry"
        disabled={importer.isPending}
        onClick={() => runImport(failed.url)}
      >
        Retry
      </Button>
    </div>
  ) : null;

  if (hasSheet) {
    const refresh = () => {
      if (sheet?.sourceUrl) runImport(sheet.sourceUrl);
    };
    return (
      <div className="flex flex-col gap-2" data-testid="song-chords">
        <Button
          type="button"
          size="lg"
          className="w-full"
          data-testid="song-chords-button"
          onClick={openReader}
        >
          <Guitar /> Chords
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="song-chords-edit"
            disabled={!sheet}
            onClick={() => setMode("editor")}
          >
            Edit
          </Button>
          {sheet?.source === "ultimate-guitar" && sheet.sourceUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="song-chords-refresh"
              disabled={importer.isPending}
              onClick={() =>
                sheet.editedAt ? setConfirmRefresh(true) : refresh()
              }
            >
              {importer.isPending
                ? "Refreshing..."
                : "Refresh from Ultimate Guitar"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="song-chords-remove"
            onClick={() => setConfirmRemove(true)}
          >
            Remove chords
          </Button>
        </div>
        {errorBlock}
        {removeFailed ? (
          <p
            role="alert"
            data-testid="song-chords-remove-error"
            className="text-sm text-destructive"
          >
            Could not remove the chords. Try again.
          </p>
        ) : null}
        <ConfirmDialog
          open={confirmRefresh}
          onOpenChange={setConfirmRefresh}
          title="Refresh from Ultimate Guitar?"
          description="This replaces your edits to these chords with the Ultimate Guitar version."
          confirmLabel="Overwrite"
          destructive
          onConfirm={refresh}
        />
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Remove chords?"
          description="The chord sheet is deleted for everyone in the band."
          confirmLabel="Remove"
          destructive
          onConfirm={() => {
            setRemoveFailed(false);
            remove.mutate(undefined, { onError: () => setRemoveFailed(true) });
          }}
        />
      </div>
    );
  }

  if (importer.isPending) {
    return (
      <p
        data-testid="song-chords-importing"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" /> Importing chords...
      </p>
    );
  }

  const match = suggestion.data?.match ?? null;
  const others = suggestion.data?.versions ?? [];
  const importPasted = () => {
    if (!isUltimateGuitarUrl(paste)) {
      setPasteError(true);
      return;
    }
    setPasteError(false);
    runImport(paste.trim());
  };

  return (
    <div className="flex flex-col gap-2" data-testid="song-chords-empty">
      {errorBlock}
      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
          {suggestion.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Looking on Ultimate
              Guitar...
            </p>
          ) : match ? (
            <div
              data-testid="song-chords-suggestion"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0">
                Chords: {match.songName} by {match.artistName} (
                {versionText(match)})
              </span>
              <Button
                type="button"
                size="sm"
                data-testid="song-chords-import"
                onClick={() => runImport(match.url)}
              >
                Import
              </Button>
            </div>
          ) : null}
          {others.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                data-testid="song-chords-other-versions"
                aria-expanded={showOthers}
                onClick={() => setShowOthers((v) => !v)}
              >
                Other versions <ChevronDown />
              </Button>
              {showOthers ? (
                <ul className="flex flex-col gap-1.5">
                  {others.map((v) => (
                    <li
                      key={v.url}
                      data-testid="song-chords-version"
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{versionText(v)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => runImport(v.url)}
                      >
                        Import
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <Input
                data-testid="song-chords-paste"
                aria-label="Ultimate Guitar link"
                placeholder="Paste an Ultimate Guitar link"
                value={paste}
                onChange={(e) => {
                  setPaste(e.target.value);
                  setPasteError(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                data-testid="song-chords-paste-import"
                disabled={paste.trim() === ""}
                onClick={importPasted}
              >
                Import
              </Button>
            </div>
            {pasteError ? (
              <p role="alert" className="text-sm text-destructive">
                That doesn&apos;t look like an Ultimate Guitar link.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            data-testid="song-chords-write"
            onClick={() => setMode("editor")}
          >
            Write my own
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          data-testid="song-chords-add"
          onClick={() => setAdding(true)}
        >
          <Plus /> Add chords
        </Button>
      )}
    </div>
  );
}
