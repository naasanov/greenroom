"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GigHistoryEntry,
  SetlistDetail,
  SongSummary,
} from "@greenroom/shared";
import {
  useCopySetlist,
  useSetlist,
  useSetlistEditor,
  type SetlistEditor,
  type SetlistSong,
} from "@/lib/queries/setlists";
import { useSongs } from "@/lib/queries/songs";
import { useMediaQuery } from "@/lib/use-media-query";

/** RightSheet's slide-out time; the sheet unmounts after it. */
const SHEET_EXIT_MS = 400;

/**
 * Runs before every edit. Resolve `false` to cancel the edit; resolve a
 * setlist id to apply it to that setlist instead (a practice drawer can fork
 * the occurrence's setlist here). Resolve anything else to continue.
 */
export type BeforeChange = () =>
  boolean | string | void | Promise<boolean | string | void>;

/** Where the library drawer sits: beside the event drawer, over it, or stacked (phone). */
export type LibraryMode = "side" | "overlay" | "stack";

export interface SetlistBuilder {
  bandId: string;
  setlistId: string | undefined;
  /** False only while a setlist is expected but has no id yet (gigs load theirs first). */
  ready: boolean;
  setlist: SetlistDetail | undefined;
  loadError: boolean;
  editor: SetlistEditor;
  songs: SongSummary[] | undefined;
  /** Runs an edit through `beforeChange`; `apply` gets the target setlist id override. */
  guarded: (apply: (target?: string) => void) => Promise<void>;
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  /** The add-song sheet; `open` turns false while it slides away. */
  sheet: { nonce: number; initialText: string; open: boolean } | null;
  openSheet: (initialText?: string) => void;
  closeSheet: () => void;
  copyEntry: GigHistoryEntry | null;
  requestCopy: (entry: GigHistoryEntry) => void;
  cancelCopy: () => void;
  copy: (entry: GigHistoryEntry, mode: "replace" | "append") => void;
  copyFailed: boolean;
  mode: LibraryMode;
  /** True when the event drawer must make room for the add-song sheet. */
  besideEffective: boolean;
  /** Setlist id to leave out of the copy picker (the current gig's own). */
  excludeGigId: string | undefined;
}

/**
 * State and edit actions for one setlist, shared by the section in the event
 * drawer and the library/copy/add-song drawers beside it. `beside` is true
 * when the event drawer already sits left of the agenda sheet.
 */
export function useSetlistBuilder({
  bandId,
  setlistId,
  beside = false,
  excludeGigId,
  beforeChange,
  allowEmpty = false,
}: {
  bandId: string;
  setlistId: string | undefined;
  beside?: boolean;
  excludeGigId?: string;
  beforeChange?: BeforeChange;
  /** Treat a missing setlist id as "no setlist yet"; `beforeChange` supplies one on the first edit. */
  allowEmpty?: boolean;
}): SetlistBuilder {
  const detail = useSetlist(bandId, setlistId);
  const editor = useSetlistEditor(bandId, setlistId);
  const songsQuery = useSongs(bandId, { q: "", sort: "title" });
  const copyMutation = useCopySetlist(bandId, setlistId);
  const [libraryOpen, setLibraryOpenState] = useState(false);
  const [historyOpen, setHistoryOpenState] = useState(false);
  const [sheet, setSheet] = useState<SetlistBuilder["sheet"]>(null);
  const [copyEntry, setCopyEntry] = useState<GigHistoryEntry | null>(null);
  const nonce = useRef(0);

  const wide = useMediaQuery("(min-width: 768px)");
  const sheetOpen = !!sheet?.open;
  const besideEffective = beside || (wide && sheetOpen);
  const fitsBesideAgenda = useMediaQuery("(min-width: 1300px)");
  const fitsAlone = useMediaQuery("(min-width: 960px)");
  const fits = besideEffective ? fitsBesideAgenda : fitsAlone;
  const mode: LibraryMode = !wide ? "stack" : fits ? "side" : "overlay";

  const beforeChangeRef = useRef(beforeChange);
  useEffect(() => {
    beforeChangeRef.current = beforeChange;
  });
  const guarded = useCallback(async (apply: (target?: string) => void) => {
    const guard = beforeChangeRef.current;
    if (!guard) return apply();
    const result = await guard();
    if (result === false) return;
    apply(typeof result === "string" ? result : undefined);
  }, []);

  const setLibraryOpen = useCallback((open: boolean) => {
    setLibraryOpenState(open);
    if (open) setHistoryOpenState(false);
  }, []);
  const setHistoryOpen = useCallback((open: boolean) => {
    setHistoryOpenState(open);
    if (open) setLibraryOpenState(false);
  }, []);

  const openSheet = useCallback((initialText = "") => {
    nonce.current += 1;
    setSheet({ nonce: nonce.current, initialText, open: true });
  }, []);
  // The sheet stays mounted while it slides away, then is dropped.
  const closeSheet = useCallback(() => {
    setSheet((s) => (s ? { ...s, open: false } : s));
    setTimeout(() => setSheet((s) => (s && !s.open ? null : s)), SHEET_EXIT_MS);
  }, []);

  const copy = useCallback(
    (entry: GigHistoryEntry, mode: "replace" | "append") => {
      setCopyEntry(null);
      void guarded((target) =>
        copyMutation.mutate({
          sourceSetlistId: entry.setlistId,
          mode,
          target,
        }),
      );
    },
    [guarded, copyMutation],
  );

  const requestCopy = useCallback(
    (entry: GigHistoryEntry) => {
      setHistoryOpenState(false);
      if ((detail.data?.songCount ?? 0) === 0) copy(entry, "replace");
      else setCopyEntry(entry);
    },
    [detail.data?.songCount, copy],
  );

  return {
    bandId,
    setlistId,
    ready: !!setlistId || allowEmpty,
    setlist: detail.data,
    loadError: detail.isError,
    editor,
    songs: songsQuery.data,
    guarded,
    libraryOpen,
    setLibraryOpen,
    historyOpen,
    setHistoryOpen,
    sheet,
    openSheet,
    closeSheet,
    copyEntry,
    requestCopy,
    cancelCopy: () => setCopyEntry(null),
    copy,
    copyFailed: copyMutation.isError,
    mode,
    besideEffective,
    excludeGigId,
  };
}

export type { SetlistSong };
