"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  SONG_ERROR_CODES,
  type CreateSong,
  type DeletedSong,
  type ImportProgress,
  type ResolveResult,
  type SongCreated,
  type SongDetail,
  type SongSort,
  type SongSummary,
  type SuggestedReference,
  type UpdateSong,
} from "@greenroom/shared";
import { api, getApiUrl } from "@/lib/api";
import { keys } from "@/lib/queries";

const typed = <T>() => z.custom<T>();

const songsRoot = (bandId: string) => ["bands", bandId, "songs"] as const;

export const songKeys = {
  list: (bandId: string, q: string, sort: SongSort) =>
    [...songsRoot(bandId), "list", { q, sort }] as const,
  resolve: (bandId: string, input: string) =>
    ["bands", bandId, "song-resolve", input] as const,
  importStatus: (bandId: string, importId: string) =>
    ["bands", bandId, "song-imports", importId] as const,
};

/** Thrown by `useCreateSong` when the song already exists in the library. */
export class DuplicateSongError extends Error {
  constructor(readonly songId: string) {
    super("Already in your library");
    this.name = "DuplicateSongError";
  }
}

export function useSongs(
  bandId: string | undefined,
  { q, sort }: { q: string; sort: SongSort },
  enabled = true,
) {
  return useQuery({
    queryKey: songKeys.list(bandId ?? "", q, sort),
    queryFn: () =>
      api(
        `/bands/${bandId}/songs?${new URLSearchParams({
          ...(q ? { q } : {}),
          sort,
        })}`,
        { schema: typed<SongSummary[]>() },
      ),
    enabled: !!bandId && enabled,
    placeholderData: keepPreviousData,
  });
}

/** Song detail; idle while `songId` is null (the add sheet). */
export function useSongDetail(bandId: string, songId: string | null) {
  return useQuery({
    queryKey: keys.song(bandId, songId ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/songs/${songId}`, { schema: typed<SongDetail>() }),
    enabled: !!songId,
  });
}

/** Smart-add lookup for the add sheet's single input. */
export function useResolveSong(bandId: string, input: string) {
  return useQuery({
    queryKey: songKeys.resolve(bandId, input),
    queryFn: () =>
      api(`/bands/${bandId}/songs/resolve`, {
        method: "POST",
        body: { input },
        schema: typed<ResolveResult>(),
      }),
    enabled: input.length > 0,
    retry: false,
    gcTime: 30_000,
  });
}

/** Songsterr tab suggestion for a title/artist, or null when none matches. */
export function useSuggestTab(
  bandId: string,
  title: string,
  artist: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["bands", bandId, "song-suggest-tab", title, artist] as const,
    queryFn: async () => {
      const res = await api(`/bands/${bandId}/songs/suggest-tab`, {
        method: "POST",
        body: { title, ...(artist ? { artist } : {}) },
        schema: typed<{ suggestedReference: SuggestedReference | null }>(),
      });
      return res.suggestedReference;
    },
    enabled: enabled && title.length > 0,
    retry: false,
    staleTime: 60_000,
  });
}

/** Creates a song; a 409 duplicate surfaces as `DuplicateSongError`. */
export function useCreateSong(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSong): Promise<SongCreated> => {
      const res = await fetch(`${getApiUrl()}/bands/${bandId}/songs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          songId?: string;
        };
        if (data.code === SONG_ERROR_CODES.duplicateSong && data.songId) {
          throw new DuplicateSongError(data.songId);
        }
      }
      if (!res.ok) throw new Error("Could not save the song");
      return (await res.json()) as SongCreated;
    },
    onSuccess: (song) => {
      qc.setQueryData(keys.song(bandId, song.id), song);
      void qc.invalidateQueries({ queryKey: songsRoot(bandId) });
    },
  });
}

export function useUpdateSong(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSong) =>
      api(`/bands/${bandId}/songs/${songId}`, {
        method: "PATCH",
        body,
        schema: typed<SongDetail>(),
      }),
    onSuccess: (song) => {
      qc.setQueryData(keys.song(bandId, songId), song);
      void qc.invalidateQueries({ queryKey: songsRoot(bandId) });
    },
  });
}

export function useDeleteSong(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (songId: string) =>
      api(`/bands/${bandId}/songs/${songId}`, {
        method: "DELETE",
        schema: typed<DeletedSong>(),
      }),
    onSuccess: (_res, songId) => {
      qc.removeQueries({ queryKey: keys.song(bandId, songId) });
      void qc.invalidateQueries({ queryKey: songsRoot(bandId) });
    },
  });
}

export function useStartImport(bandId: string) {
  return useMutation({
    mutationFn: (url: string) =>
      api(`/bands/${bandId}/songs/import`, {
        method: "POST",
        body: { url },
        schema: typed<ImportProgress>(),
      }),
  });
}

/** Polls an import until it completes or fails, refreshing the list at the end. */
export function useImportProgress(bandId: string, importId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: songKeys.importStatus(bandId, importId ?? ""),
    queryFn: async () => {
      const progress = await api(`/bands/${bandId}/songs/imports/${importId}`, {
        schema: typed<ImportProgress>(),
      });
      if (progress.status === "completed" || progress.status === "failed") {
        void qc.invalidateQueries({ queryKey: songsRoot(bandId) });
      }
      return progress;
    },
    enabled: !!importId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 700;
    },
  });
}
