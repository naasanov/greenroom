"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  fileEntrySchema,
  filesFolderListingSchema,
  setFileSongsResultSchema,
} from "@greenroom/shared";
import { api, getApiUrl, isApiError } from "@/lib/api";

const base = (bandId: string) => `/bands/${bandId}/files`;

export const filesKeys = {
  all: (bandId: string) => ["bands", bandId, "files"] as const,
  folder: (bandId: string, folderId: string) =>
    ["bands", bandId, "files", "folder", folderId] as const,
};

export const filesThumbnailUrl = (bandId: string, fileId: string) =>
  `${getApiUrl()}${base(bandId)}/items/${encodeURIComponent(fileId)}/thumbnail`;

export const filesContentUrl = (
  bandId: string,
  fileId: string,
  download = false,
) =>
  `${getApiUrl()}${base(bandId)}/items/${encodeURIComponent(fileId)}/content${
    download ? "?download=1" : ""
  }`;

/** Shared by the Files view and idle/intent prefetch so both fill the same cache entry. */
export const filesFolderQuery = (bandId: string, folderId: string) => ({
  queryKey: filesKeys.folder(bandId, folderId),
  retry: (count: number, e: unknown) =>
    !(isApiError(e, 404) || isApiError(e, 409)) && count < 2,
  queryFn: () =>
    api(`${base(bandId)}/folder/${encodeURIComponent(folderId)}`, {
      schema: filesFolderListingSchema,
    }),
});

/** One folder of the band's Files tree; `folderId` is a Drive id or "root". */
export function useFilesFolder(
  bandId: string,
  folderId: string,
  enabled = true,
) {
  return useQuery({ ...filesFolderQuery(bandId, folderId), enabled });
}

function useInvalidateFiles(bandId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: filesKeys.all(bandId) });
}

export function useCreateFilesFolder(bandId: string) {
  const invalidate = useInvalidateFiles(bandId);
  return useMutation({
    mutationFn: (v: { parentId: string; name: string }) =>
      api(`${base(bandId)}/folders`, {
        method: "POST",
        body: v,
        schema: fileEntrySchema,
      }),
    onSuccess: invalidate,
  });
}

export function useRenameFile(bandId: string) {
  const invalidate = useInvalidateFiles(bandId);
  return useMutation({
    mutationFn: (v: { fileId: string; name: string }) =>
      api(`${base(bandId)}/items/${encodeURIComponent(v.fileId)}`, {
        method: "PATCH",
        body: { name: v.name },
        schema: z.object({ id: z.string(), name: z.string() }),
      }),
    onSuccess: invalidate,
  });
}

export function useTrashFiles(bandId: string) {
  const invalidate = useInvalidateFiles(bandId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      api(`${base(bandId)}/items/trash`, {
        method: "POST",
        body: { ids },
        schema: z.object({ trashed: z.number() }),
      }),
    onSuccess: invalidate,
  });
}

export function useSetFileSongs(bandId: string) {
  const invalidate = useInvalidateFiles(bandId);
  return useMutation({
    mutationFn: (v: { fileId: string; songIds: string[] }) =>
      api(`${base(bandId)}/items/${encodeURIComponent(v.fileId)}/songs`, {
        method: "PUT",
        body: { songIds: v.songIds },
        schema: setFileSongsResultSchema,
      }),
    onSuccess: invalidate,
  });
}
