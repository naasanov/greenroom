"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { z } from "zod";
import type {
  CopySetlist,
  GigHistoryEntry,
  GigSetlist,
  SetlistDetail,
  SetlistItem,
  SongSummary,
} from "@greenroom/shared";
import { api } from "@/lib/api";

const typed = <T>() => z.custom<T>();

export const setlistKeys = {
  detail: (bandId: string, setlistId: string) =>
    ["bands", bandId, "setlists", setlistId] as const,
  gig: (bandId: string, gigId: string) =>
    ["bands", bandId, "gigs", gigId, "setlist"] as const,
  history: (bandId: string, q: string) =>
    ["bands", bandId, "setlist-history", q] as const,
  historyRoot: (bandId: string) =>
    ["bands", bandId, "setlist-history"] as const,
};

/** The song fields an optimistic setlist row needs. */
export type SetlistSong = Pick<
  SongSummary,
  "id" | "title" | "artist" | "durationSeconds" | "imageUrl"
>;

const base = (bandId: string, setlistId: string) =>
  `/bands/${bandId}/setlists/${setlistId}`;

/** The gig's setlist (created empty on first access); seeds the detail cache. */
export function useGigSetlist(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: setlistKeys.gig(bandId, gigId),
    queryFn: async () => {
      const gs = await api(`/bands/${bandId}/gigs/${gigId}/setlist`, {
        schema: typed<GigSetlist>(),
      });
      qc.setQueryData(setlistKeys.detail(bandId, gs.id), gs);
      return gs;
    },
    staleTime: Infinity,
  });
}

export function useSetlist(bandId: string, setlistId: string | undefined) {
  return useQuery({
    queryKey: setlistKeys.detail(bandId, setlistId ?? ""),
    queryFn: () =>
      api(base(bandId, setlistId!), { schema: typed<SetlistDetail>() }),
    enabled: !!setlistId,
    staleTime: 30_000,
  });
}

/** Past gigs with a setlist, newest first; the caller filters out the current gig. */
export function useSetlistHistory(bandId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: setlistKeys.history(bandId, q),
    queryFn: () =>
      api(
        `/bands/${bandId}/setlists/history?${new URLSearchParams({
          ...(q ? { q } : {}),
          limit: "50",
        })}`,
        { schema: typed<GigHistoryEntry[]>() },
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function withItems(detail: SetlistDetail, items: SetlistItem[]): SetlistDetail {
  const known = items.filter((i) => i.durationSeconds !== null);
  return {
    ...detail,
    items: items.map((item, position) => ({ ...item, position })),
    songCount: items.length,
    totalDurationSeconds: known.reduce(
      (sum, i) => sum + (i.durationSeconds ?? 0),
      0,
    ),
    unknownDurationCount: items.length - known.length,
  };
}

const optimisticItem = (song: SetlistSong): SetlistItem => ({
  itemId: `pending-${song.id}`,
  position: 0,
  songId: song.id,
  title: song.title,
  artist: song.artist,
  durationSeconds: song.durationSeconds,
  imageUrl: song.imageUrl,
});

// One request chain per setlist keeps server writes in tap order.
const chains = new Map<string, { tail: Promise<unknown>; pending: number }>();

/** Runs `request` after the setlist's earlier writes; refetches once the chain is idle. */
function enqueue(
  qc: QueryClient,
  bandId: string,
  setlistId: string,
  request: () => Promise<unknown>,
  onFail: (e: unknown) => void,
): Promise<void> {
  const chain = chains.get(setlistId) ?? {
    tail: Promise.resolve(),
    pending: 0,
  };
  chains.set(setlistId, chain);
  chain.pending += 1;
  const run = chain.tail.then(request).then(
    () => undefined,
    (e: unknown) => {
      onFail(e);
    },
  );
  chain.tail = run;
  return run.then(() => {
    chain.pending -= 1;
    if (chain.pending > 0) return;
    chains.delete(setlistId);
    void qc.invalidateQueries({
      queryKey: setlistKeys.detail(bandId, setlistId),
    });
    void qc.invalidateQueries({ queryKey: ["bands", bandId, "songs"] });
    void qc.invalidateQueries({ queryKey: setlistKeys.historyRoot(bandId) });
  });
}

export interface SetlistEditor {
  /** Appends the song, or removes it when it is already in the setlist. */
  toggle: (song: SetlistSong, target?: string) => void;
  append: (song: SetlistSong, target?: string) => void;
  remove: (songId: string, target?: string) => void;
  /** Replaces the whole order; `songs` supplies rows for ids not yet in the list. */
  setOrder: (songIds: string[], songs?: SetlistSong[], target?: string) => void;
  /** Last write failure; the list has already been refetched to server truth. */
  error: boolean;
  clearError: () => void;
}

/**
 * Live setlist edits. Each call updates the cache synchronously (so the UI
 * answers in the same frame), cancels in-flight reads, and queues the write
 * behind earlier ones. Server responses never overwrite the cache; one refetch
 * runs when the queue empties. `target` overrides the setlist id for a single
 * call (a `beforeChange` guard may fork to a new setlist).
 */
export function useSetlistEditor(
  bandId: string,
  setlistId: string | undefined,
): SetlistEditor {
  const qc = useQueryClient();
  const [error, setError] = useState(false);

  const edit = useCallback(
    (
      target: string | undefined,
      next: (items: SetlistItem[]) => SetlistItem[],
      request: (id: string) => Promise<unknown>,
    ) => {
      const id = target ?? setlistId;
      if (!id) return;
      const key = setlistKeys.detail(bandId, id);
      void qc.cancelQueries({ queryKey: key });
      qc.setQueryData<SetlistDetail>(key, (d) =>
        d ? withItems(d, next(d.items)) : d,
      );
      void enqueue(
        qc,
        bandId,
        id,
        () => request(id),
        () => setError(true),
      );
    },
    [qc, bandId, setlistId],
  );

  const append = useCallback(
    (song: SetlistSong, target?: string) =>
      edit(
        target,
        (items) =>
          items.some((i) => i.songId === song.id)
            ? items
            : [...items, optimisticItem(song)],
        (id) =>
          api(`${base(bandId, id)}/items`, {
            method: "POST",
            body: { songId: song.id },
          }),
      ),
    [edit, bandId],
  );

  const remove = useCallback(
    (songId: string, target?: string) =>
      edit(
        target,
        (items) => items.filter((i) => i.songId !== songId),
        (id) =>
          api(`${base(bandId, id)}/items/${songId}`, { method: "DELETE" }),
      ),
    [edit, bandId],
  );

  const toggle = useCallback(
    (song: SetlistSong, target?: string) => {
      const id = target ?? setlistId;
      if (!id) return;
      const current = qc.getQueryData<SetlistDetail>(
        setlistKeys.detail(bandId, id),
      );
      if (current?.items.some((i) => i.songId === song.id)) remove(song.id, id);
      else append(song, id);
    },
    [qc, bandId, setlistId, append, remove],
  );

  const setOrder = useCallback(
    (songIds: string[], songs: SetlistSong[] = [], target?: string) =>
      edit(
        target,
        (items) => {
          const byId = new Map(items.map((i) => [i.songId, i]));
          for (const s of songs) {
            if (!byId.has(s.id)) byId.set(s.id, optimisticItem(s));
          }
          return songIds.flatMap((sid) => byId.get(sid) ?? []);
        },
        (id) =>
          api(`${base(bandId, id)}/items`, {
            method: "PUT",
            body: { songIds },
          }),
      ),
    [edit, bandId],
  );

  const clearError = useCallback(() => setError(false), []);
  return { toggle, append, remove, setOrder, error, clearError };
}

/** Copies another setlist in; the response replaces the cached detail. */
export function useCopySetlist(bandId: string, setlistId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceSetlistId,
      mode,
      target,
    }: CopySetlist & { target?: string }) =>
      api(`${base(bandId, target ?? setlistId!)}/copy`, {
        method: "POST",
        body: { sourceSetlistId, mode },
        schema: typed<SetlistDetail>(),
      }),
    onSuccess: (detail, vars) => {
      const id = vars.target ?? setlistId!;
      if (!chains.has(id)) {
        qc.setQueryData(setlistKeys.detail(bandId, id), detail);
      }
      void qc.invalidateQueries({ queryKey: ["bands", bandId, "songs"] });
      void qc.invalidateQueries({ queryKey: setlistKeys.historyRoot(bandId) });
    },
  });
}
