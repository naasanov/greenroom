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
  Lineup,
  LineupCopyResult,
  LineupHistoryEntry,
  LineupMember,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { eventKeys } from "@/lib/queries/events";

const typed = <T>() => z.custom<T>();

export const lineupKeys = {
  gig: (bandId: string, gigId: string) =>
    ["bands", bandId, "gigs", gigId, "lineup"] as const,
  history: (bandId: string, q: string) =>
    ["bands", bandId, "lineup-history", q] as const,
  historyRoot: (bandId: string) => ["bands", bandId, "lineup-history"] as const,
};

const path = (bandId: string, gigId: string) =>
  `/bands/${bandId}/gigs/${gigId}/lineup`;

const byName = (a: LineupMember, b: LineupMember) =>
  a.displayName.localeCompare(b.displayName);

export function useLineup(bandId: string, gigId: string) {
  return useQuery({
    queryKey: lineupKeys.gig(bandId, gigId),
    queryFn: () => api(path(bandId, gigId), { schema: typed<Lineup>() }),
    staleTime: 30_000,
  });
}

/** Past gigs with a lineup, newest first; the caller filters out the current gig. */
export function useLineupHistory(bandId: string, q: string, enabled = true) {
  return useQuery({
    queryKey: lineupKeys.history(bandId, q),
    queryFn: () =>
      api(
        `/bands/${bandId}/lineups/history?${new URLSearchParams({
          ...(q ? { q } : {}),
          limit: "50",
        })}`,
        { schema: typed<LineupHistoryEntry[]>() },
      ),
    enabled,
    placeholderData: keepPreviousData,
  });
}

// One request chain per gig keeps server writes in tap order.
const chains = new Map<string, { tail: Promise<unknown>; pending: number }>();

/** Runs `request` after the gig's earlier writes; refetches once the chain is idle. */
function enqueue(
  qc: QueryClient,
  bandId: string,
  gigId: string,
  request: () => Promise<unknown>,
  onFail: () => void,
): void {
  const chain = chains.get(gigId) ?? { tail: Promise.resolve(), pending: 0 };
  chains.set(gigId, chain);
  chain.pending += 1;
  const run = chain.tail.then(request).then(
    () => undefined,
    () => onFail(),
  );
  chain.tail = run;
  void run.then(() => {
    chain.pending -= 1;
    if (chain.pending > 0) return;
    chains.delete(gigId);
    void qc.invalidateQueries({ queryKey: lineupKeys.gig(bandId, gigId) });
    void qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
    void qc.invalidateQueries({ queryKey: lineupKeys.historyRoot(bandId) });
  });
}

export interface LineupEditor {
  /** Replaces the whole lineup; the cache updates in the same frame. */
  setMembers: (members: LineupMember[]) => void;
  error: boolean;
  clearError: () => void;
}

/**
 * Live lineup edits: the cache is written synchronously (kept sorted by name)
 * and the full membership list is PUT behind earlier writes. Server responses
 * never overwrite the cache; one refetch runs when the queue empties.
 */
export function useLineupEditor(bandId: string, gigId: string): LineupEditor {
  const qc = useQueryClient();
  const [error, setError] = useState(false);

  const setMembers = useCallback(
    (members: LineupMember[]) => {
      const key = lineupKeys.gig(bandId, gigId);
      const sorted = [...members].sort(byName);
      void qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Lineup>(key, (l) =>
        l ? { ...l, members: sorted } : { gigId, members: sorted },
      );
      enqueue(
        qc,
        bandId,
        gigId,
        () =>
          api(path(bandId, gigId), {
            method: "PUT",
            body: { membershipIds: sorted.map((m) => m.membershipId) },
          }),
        () => setError(true),
      );
    },
    [qc, bandId, gigId],
  );

  const clearError = useCallback(() => setError(false), []);
  return { setMembers, error, clearError };
}

/** Replaces the lineup with the latest earlier gig's; the response fills the cache. */
export function useCopyLastLineup(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`${path(bandId, gigId)}/copy-from-last`, {
        method: "POST",
        schema: typed<LineupCopyResult>(),
      }),
    onSuccess: (res) => {
      if (!chains.has(gigId)) {
        qc.setQueryData<Lineup>(lineupKeys.gig(bandId, gigId), {
          gigId: res.gigId,
          members: res.members,
        });
      }
      void qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: lineupKeys.historyRoot(bandId) });
    },
  });
}

/** Replaces the lineup with a chosen gig's; the response fills the cache. */
export function useCopyLineup(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceGigId }: { sourceGigId: string }) =>
      api(`${path(bandId, gigId)}/copy`, {
        method: "POST",
        body: { sourceGigId },
        schema: typed<Lineup>(),
      }),
    onSuccess: (res) => {
      if (!chains.has(gigId)) {
        qc.setQueryData<Lineup>(lineupKeys.gig(bandId, gigId), {
          gigId: res.gigId,
          members: res.members,
        });
      }
      void qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: lineupKeys.historyRoot(bandId) });
    },
  });
}
