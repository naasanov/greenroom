"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import type {
  AudioMarker,
  CreateAudioMarker,
  UpdateAudioMarker,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";

const typed = <T>() => z.custom<T>();

const root = (bandId: string, fileId: string) =>
  ["bands", bandId, "audio-markers", fileId] as const;

export const audioMarkerKeys = {
  list: (bandId: string, fileId: string) => root(bandId, fileId),
  create: (bandId: string, fileId: string) =>
    [...root(bandId, fileId), "create"] as const,
  update: (bandId: string, fileId: string) =>
    [...root(bandId, fileId), "update"] as const,
  remove: (bandId: string, fileId: string) =>
    [...root(bandId, fileId), "delete"] as const,
};

const sortMarkers = (list: AudioMarker[]) =>
  [...list].sort(
    (a, b) => a.positionMs - b.positionMs || a.id.localeCompare(b.id),
  );

const filesBase = (bandId: string, fileId: string) =>
  `/bands/${bandId}/files/items/${encodeURIComponent(fileId)}/markers`;

/** Marker ids start with this prefix until the server confirms the create. */
export const TEMP_MARKER_PREFIX = "temp-";
export const isTempMarkerId = (id: string) => id.startsWith(TEMP_MARKER_PREFIX);

let tempCounter = 0;

/** Band-shared markers of a file, polled lightly so bandmates' edits appear. */
export function useAudioMarkers(
  bandId: string | undefined,
  fileId: string | undefined,
) {
  return useQuery({
    queryKey: audioMarkerKeys.list(bandId ?? "", fileId ?? ""),
    queryFn: () =>
      api(filesBase(bandId!, fileId!), { schema: typed<AudioMarker[]>() }),
    enabled: !!bandId && !!fileId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** Cancels in-flight reads, applies `fn` to the cached list and returns the snapshot. */
async function applyOptimistic(
  qc: QueryClient,
  key: readonly unknown[],
  fn: (list: AudioMarker[]) => AudioMarker[],
) {
  await qc.cancelQueries({ queryKey: key, exact: true });
  const previous = qc.getQueryData<AudioMarker[]>(key);
  qc.setQueryData<AudioMarker[]>(key, (old) => sortMarkers(fn(old ?? [])));
  return { previous };
}

/** Refetches once the last marker mutation for the file settles. */
function settle(qc: QueryClient, bandId: string, fileId: string) {
  const pending = qc.isMutating({
    predicate: (m) => {
      const k = m.options.mutationKey;
      return (
        Array.isArray(k) &&
        k[0] === "bands" &&
        k[1] === bandId &&
        k[2] === "audio-markers" &&
        k[3] === fileId
      );
    },
  });
  // The settling mutation still counts itself while its callback runs.
  if (pending <= 1) {
    void qc.invalidateQueries({
      queryKey: audioMarkerKeys.list(bandId, fileId),
      exact: true,
    });
  }
}

export function useCreateAudioMarker(bandId: string, fileId: string) {
  const qc = useQueryClient();
  const me = useMe();
  const key = audioMarkerKeys.list(bandId, fileId);
  return useMutation({
    mutationKey: audioMarkerKeys.create(bandId, fileId),
    mutationFn: (v: CreateAudioMarker & { tempId?: string }) =>
      api(filesBase(bandId, fileId), {
        method: "POST",
        body: { positionMs: v.positionMs, title: v.title },
        schema: typed<AudioMarker>(),
      }),
    onMutate: async (v) => {
      const now = new Date().toISOString();
      const tempId = v.tempId ?? `${TEMP_MARKER_PREFIX}${++tempCounter}`;
      const ctx = await applyOptimistic(qc, key, (list) => [
        ...list,
        {
          id: tempId,
          fileId,
          positionMs: v.positionMs,
          title: v.title,
          createdBy: me.data
            ? { userId: me.data.id, displayName: me.data.displayName }
            : null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      return { ...ctx, tempId };
    },
    onSuccess: (created, _v, ctx) => {
      qc.setQueryData<AudioMarker[]>(key, (old) =>
        sortMarkers(
          (old ?? [])
            .filter((m) => m.id !== ctx?.tempId && m.id !== created.id)
            .concat(created),
        ),
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => settle(qc, bandId, fileId),
  });
}

export function useUpdateAudioMarker(bandId: string, fileId: string) {
  const qc = useQueryClient();
  const key = audioMarkerKeys.list(bandId, fileId);
  return useMutation({
    mutationKey: audioMarkerKeys.update(bandId, fileId),
    mutationFn: (v: { markerId: string; patch: UpdateAudioMarker }) =>
      api(`/bands/${bandId}/audio-markers/${encodeURIComponent(v.markerId)}`, {
        method: "PATCH",
        body: v.patch,
        schema: typed<AudioMarker>(),
      }),
    onMutate: (v) =>
      applyOptimistic(qc, key, (list) =>
        list.map((m) => (m.id === v.markerId ? { ...m, ...v.patch } : m)),
      ),
    onSuccess: (saved) => {
      // Only the server's timestamp is merged so a newer queued patch is not clobbered.
      qc.setQueryData<AudioMarker[]>(key, (old) =>
        old?.map((m) =>
          m.id === saved.id ? { ...m, updatedAt: saved.updatedAt } : m,
        ),
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => settle(qc, bandId, fileId),
  });
}

export function useDeleteAudioMarker(bandId: string, fileId: string) {
  const qc = useQueryClient();
  const key = audioMarkerKeys.list(bandId, fileId);
  return useMutation({
    mutationKey: audioMarkerKeys.remove(bandId, fileId),
    mutationFn: (markerId: string) =>
      api(`/bands/${bandId}/audio-markers/${encodeURIComponent(markerId)}`, {
        method: "DELETE",
      }),
    onMutate: (markerId) =>
      applyOptimistic(qc, key, (list) => list.filter((m) => m.id !== markerId)),
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => settle(qc, bandId, fileId),
  });
}
