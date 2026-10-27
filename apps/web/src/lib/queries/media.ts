"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  gigMediaSchema,
  type GigMedia,
  type MediaFolder,
  type MediaItem,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { googleKeys } from "@/lib/queries/google";

const mediaKey = (bandId: string, gigId: string) =>
  [...googleKeys.media(bandId), gigId] as const;

/** Media of one gig (folders, unsorted items, counts). */
export function useGigMedia(bandId: string, gigId: string) {
  return useQuery({
    queryKey: mediaKey(bandId, gigId),
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}/media`, { schema: gigMediaSchema }),
  });
}

/** Every item of a gig in display order: Unsorted first, then folders by position. */
export function orderedItems(media: GigMedia): MediaItem[] {
  return [
    ...media.unsorted,
    ...[...media.folders]
      .sort((a, b) => a.position - b.position)
      .flatMap((f) => f.items),
  ];
}

type Updater = (media: GigMedia) => GigMedia;

const mapItems = (
  media: GigMedia,
  fn: (i: MediaItem) => MediaItem,
): GigMedia => ({
  ...media,
  unsorted: media.unsorted.map(fn),
  folders: media.folders.map((f) => ({ ...f, items: f.items.map(fn) })),
});

const removeItems = (media: GigMedia, ids: Set<string>): GigMedia => ({
  ...media,
  unsorted: media.unsorted.filter((i) => !ids.has(i.id)),
  folders: media.folders.map((f) => ({
    ...f,
    items: f.items.filter((i) => !ids.has(i.id)),
  })),
});

/**
 * Runs `request` with an optimistic cache edit: the cache changes in the same
 * frame, a failure restores the previous data, and the gig's media refetches
 * once the request settles.
 */
function useOptimistic<V>(
  bandId: string,
  gigId: string,
  update: (vars: V) => Updater | null,
  request: (vars: V) => Promise<unknown>,
) {
  const qc = useQueryClient();
  const key = mediaKey(bandId, gigId);
  return useMutation({
    mutationFn: request,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<GigMedia>(key);
      const fn = update(vars);
      if (fn && previous) qc.setQueryData<GigMedia>(key, fn(previous));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => invalidate(qc, bandId),
  });
}

function invalidate(qc: QueryClient, bandId: string) {
  return qc.invalidateQueries({ queryKey: googleKeys.media(bandId) });
}

export function useMoveMediaItems(bandId: string, gigId: string) {
  return useOptimistic<{ itemIds: string[]; folderId: string | null }>(
    bandId,
    gigId,
    ({ itemIds, folderId }) =>
      (media) => {
        const ids = new Set(itemIds);
        const moved = [
          ...media.unsorted,
          ...media.folders.flatMap((f) => f.items),
        ].filter((i) => ids.has(i.id));
        const rest = removeItems(media, ids);
        return folderId === null
          ? { ...rest, unsorted: [...rest.unsorted, ...moved] }
          : {
              ...rest,
              folders: rest.folders.map((f) =>
                f.id === folderId ? { ...f, items: [...f.items, ...moved] } : f,
              ),
            };
      },
    (vars) =>
      api(`/bands/${bandId}/media/move`, { method: "POST", body: vars }),
  );
}

export function useRenameMediaItem(bandId: string, gigId: string) {
  return useOptimistic<{ itemId: string; name: string }>(
    bandId,
    gigId,
    ({ itemId, name }) =>
      (media) =>
        mapItems(media, (i) => (i.id === itemId ? { ...i, name } : i)),
    ({ itemId, name }) =>
      api(`/bands/${bandId}/media/${itemId}`, {
        method: "PATCH",
        body: { name },
      }),
  );
}

export function useTrashMediaItems(bandId: string, gigId: string) {
  return useOptimistic<{ itemIds: string[] }>(
    bandId,
    gigId,
    ({ itemIds }) =>
      (media) =>
        removeItems(media, new Set(itemIds)),
    (vars) =>
      api(`/bands/${bandId}/media/trash`, { method: "POST", body: vars }),
  );
}

/** Links (or clears with null) a song; the server may also rename the items. */
export function useLinkMediaSong(bandId: string, gigId: string) {
  return useOptimistic<{ itemIds: string[]; songId: string | null }>(
    bandId,
    gigId,
    ({ itemIds, songId }) =>
      (media) => {
        const ids = new Set(itemIds);
        return mapItems(media, (i) => (ids.has(i.id) ? { ...i, songId } : i));
      },
    (vars) =>
      api(`/bands/${bandId}/media/items/song`, { method: "PUT", body: vars }),
  );
}

const folderSchema = z.custom<MediaFolder>();

export function useCreateMediaFolder(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(`/bands/${bandId}/gigs/${gigId}/media/folders`, {
        method: "POST",
        body: { name },
        schema: folderSchema,
      }),
    onSettled: () => invalidate(qc, bandId),
  });
}

export function useRenameMediaFolder(bandId: string, gigId: string) {
  return useOptimistic<{ folderId: string; name: string }>(
    bandId,
    gigId,
    ({ folderId, name }) =>
      (media) => ({
        ...media,
        folders: media.folders.map((f) =>
          f.id === folderId ? { ...f, name } : f,
        ),
      }),
    ({ folderId, name }) =>
      api(`/bands/${bandId}/media/folders/${folderId}`, {
        method: "PATCH",
        body: { name },
      }),
  );
}

export function useDeleteMediaFolder(bandId: string, gigId: string) {
  return useOptimistic<{ folderId: string }>(
    bandId,
    gigId,
    ({ folderId }) =>
      (media) => ({
        ...media,
        folders: media.folders.filter((f) => f.id !== folderId),
      }),
    ({ folderId }) =>
      api(`/bands/${bandId}/media/folders/${folderId}`, { method: "DELETE" }),
  );
}

export function useReorderMediaFolders(bandId: string, gigId: string) {
  return useOptimistic<{ ids: string[] }>(
    bandId,
    gigId,
    ({ ids }) =>
      (media) => ({
        ...media,
        folders: ids.flatMap((id, position) => {
          const f = media.folders.find((x) => x.id === id);
          return f ? [{ ...f, position }] : [];
        }),
      }),
    ({ ids }) =>
      api(`/bands/${bandId}/gigs/${gigId}/media/folders/order`, {
        method: "PUT",
        body: { ids },
      }),
  );
}
