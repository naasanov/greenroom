"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  driveStatusSchema,
  filesFolderListingSchema,
  gigMediaSchema,
  setFileSongsResultSchema,
  songFileSchema,
} from "@greenroom/shared";
import { api, getApiUrl } from "@/lib/api";
import { googleKeys } from "@/lib/queries/google";

const filesKey = (bandId: string) => ["bands", bandId, "files"] as const;
const songFilesKey = (bandId: string, songId: string) =>
  ["bands", bandId, "songs", songId, "files"] as const;

/** Live listing of one Drive folder inside the Files root ("root" is the root itself). */
export function useFolderListing(
  bandId: string,
  folderId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [...filesKey(bandId), "folder", folderId ?? "root"] as const,
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      api(`/bands/${bandId}/files/folder/${folderId ?? "root"}`, {
        schema: filesFolderListingSchema,
      }),
  });
}

/** Sets the gigs root to an existing folder, or creates a new "Gigs" folder. */
export function useSetGigsFolder(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { folderId: string } | { create: true }) =>
      api(`/bands/${bandId}/integrations/google/drive/gigs-folder`, {
        method: "POST",
        body,
        schema: driveStatusSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: googleKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: filesKey(bandId) });
    },
  });
}

/** Attaches an existing Drive folder as the gig's folder and imports its files. */
export function useLinkGigFolder(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) =>
      api(`/bands/${bandId}/gigs/${gigId}/media/link-folder`, {
        method: "POST",
        body: { folderId },
        schema: gigMediaSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: googleKeys.media(bandId) });
      void qc.invalidateQueries({ queryKey: filesKey(bandId) });
    },
  });
}

/** Drive files and folders linked to a song. */
export function useSongFiles(bandId: string, songId: string) {
  return useQuery({
    queryKey: songFilesKey(bandId, songId),
    queryFn: () =>
      api(`/bands/${bandId}/songs/${songId}/files`, {
        schema: z.array(songFileSchema),
      }),
  });
}

/** Replaces the full song set of a Drive file or folder. */
export function useSetFileSongs(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, songIds }: { fileId: string; songIds: string[] }) =>
      api(`/bands/${bandId}/files/items/${fileId}/songs`, {
        method: "PUT",
        body: { songIds },
        schema: setFileSongsResultSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: songFilesKey(bandId, songId) });
      void qc.invalidateQueries({ queryKey: filesKey(bandId) });
    },
  });
}

/** Removes one song's link to a Drive file, available or not. */
export function useUnlinkSongFile(bandId: string, songId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      api(`/bands/${bandId}/songs/${songId}/files/${fileId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: songFilesKey(bandId, songId) });
      void qc.invalidateQueries({ queryKey: filesKey(bandId) });
    },
  });
}

export const fileContentUrl = (
  bandId: string,
  fileId: string,
  download = false,
) =>
  `${getApiUrl()}/bands/${bandId}/files/items/${fileId}/content${download ? "?download=1" : ""}`;
