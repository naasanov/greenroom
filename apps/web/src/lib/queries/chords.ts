"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import type {
  ChordsIndex,
  ChordsSuggestion,
  SongChordSheet,
} from "@greenroom/shared";
import { api } from "@/lib/api";

const typed = <T>() => z.custom<T>();

const chordsRoot = (bandId: string) => ["bands", bandId, "chords"] as const;

export const chordKeys = {
  index: (bandId: string) => [...chordsRoot(bandId), "index"] as const,
  sheet: (bandId: string, songId: string) =>
    [...chordsRoot(bandId), "sheet", songId] as const,
  suggestion: (bandId: string, title: string, artist: string) =>
    [...chordsRoot(bandId), "suggestion", title, artist] as const,
};

/** Whether chords are enabled for the band and which songs have a sheet. */
export function useChordsIndex(bandId: string | undefined) {
  return useQuery({
    queryKey: chordKeys.index(bandId ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/chords`, { schema: typed<ChordsIndex>() }),
    enabled: !!bandId,
    staleTime: 30_000,
  });
}

/** A song's chord sheet; a 404 (no sheet) is an error state, not retried. */
export function useChordSheet(
  bandId: string | undefined,
  songId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: chordKeys.sheet(bandId ?? "", songId ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/chords/songs/${songId}`, {
        schema: typed<SongChordSheet>(),
      }),
    enabled: !!bandId && !!songId && enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/** The best Ultimate Guitar match and other versions for a title and artist. */
export function useChordsSuggestion(
  bandId: string | undefined,
  title: string,
  artist: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: chordKeys.suggestion(bandId ?? "", title, artist ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/chords/suggest`, {
        method: "POST",
        body: { title, artist: artist ?? null },
        schema: typed<ChordsSuggestion>(),
      }),
    enabled: !!bandId && title.trim().length > 0 && enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Plain fetch of several sheets at once, for stage mode and offline sync. */
export async function fetchChordSheets(
  bandId: string,
  songIds: string[],
): Promise<SongChordSheet[]> {
  if (songIds.length === 0) return [];
  const res = await api(`/bands/${bandId}/chords/sheets`, {
    method: "POST",
    body: { songIds },
    schema: typed<{ sheets: SongChordSheet[] }>(),
  });
  return res.sheets;
}

function refresh(qc: QueryClient, bandId: string, songId: string) {
  void qc.invalidateQueries({ queryKey: chordKeys.sheet(bandId, songId) });
  void qc.invalidateQueries({ queryKey: chordKeys.index(bandId) });
}

export function useImportChords(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      api(`/bands/${bandId}/chords/songs/${songId}/import`, {
        method: "POST",
        body: { url },
        schema: typed<SongChordSheet>(),
      }),
    onSuccess: (sheet) => {
      qc.setQueryData(chordKeys.sheet(bandId, songId), sheet);
      refresh(qc, bandId, songId);
    },
  });
}

export function useSaveChords(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api(`/bands/${bandId}/chords/songs/${songId}`, {
        method: "PUT",
        body: { text },
        schema: typed<SongChordSheet>(),
      }),
    onSuccess: (sheet) => {
      qc.setQueryData(chordKeys.sheet(bandId, songId), sheet);
      refresh(qc, bandId, songId);
    },
  });
}

export function useSetBandTranspose(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (semitones: number) =>
      api(`/bands/${bandId}/chords/songs/${songId}/band-transpose`, {
        method: "PUT",
        body: { semitones },
        schema: typed<SongChordSheet>(),
      }),
    onSuccess: (sheet) => {
      qc.setQueryData(chordKeys.sheet(bandId, songId), sheet);
      refresh(qc, bandId, songId);
    },
  });
}

export function useDeleteChords(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/bands/${bandId}/chords/songs/${songId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: chordKeys.sheet(bandId, songId) });
      void qc.invalidateQueries({ queryKey: chordKeys.index(bandId) });
    },
  });
}
