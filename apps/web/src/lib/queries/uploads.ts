"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  songMediaGroupSchema,
  uploadSessionSchema,
  type UploadSession,
} from "@greenroom/shared";
import { api, getApiUrl } from "@/lib/api";
import { sendChunk, type UploadEndpoints } from "@/lib/uploader";

export const uploadKeys = {
  mine: (bandId: string, gigId: string) =>
    ["bands", bandId, "uploads", gigId] as const,
};

const sessionsSchema = z.array(uploadSessionSchema);

/** The caller's upload sessions for a gig from the last 7 days (not cancelled). */
export function useMyUploads(bandId: string, gigId: string, enabled = true) {
  return useQuery({
    queryKey: uploadKeys.mine(bandId, gigId),
    enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}/uploads?mine=1`, {
        schema: sessionsSchema,
      }),
  });
}

export const fetchMyUploads = (bandId: string, gigId: string) =>
  api(`/bands/${bandId}/gigs/${gigId}/uploads?mine=1`, {
    schema: sessionsSchema,
  });

export const patchUpload = (
  bandId: string,
  sessionId: string,
  body: { folderId?: string | null; fileName?: string; songId?: string | null },
) =>
  api(`/bands/${bandId}/uploads/${sessionId}`, {
    method: "PATCH",
    body,
    schema: uploadSessionSchema,
  });

export const bulkPatchUploads = (
  bandId: string,
  body: { ids: string[]; folderId?: string | null; songId?: string | null },
) =>
  api(`/bands/${bandId}/uploads`, {
    method: "PATCH",
    body,
    schema: sessionsSchema,
  });

export const cancelUpload = (bandId: string, sessionId: string) =>
  api(`/bands/${bandId}/uploads/${sessionId}`, {
    method: "DELETE",
    schema: uploadSessionSchema,
  });

/** Member upload endpoints for one gig; `target` is read when the session is created. */
export function memberUploadEndpoints(
  bandId: string,
  gigId: string,
  target: () => { folderId: string | null; songId: string | null },
): UploadEndpoints {
  return {
    create: (input) =>
      api(`/bands/${bandId}/gigs/${gigId}/uploads`, {
        method: "POST",
        body: { ...input, ...target() },
        schema: uploadSessionSchema,
      }),
    chunk: (sessionId, start, end, total, body, signal) =>
      sendChunk(
        `${getApiUrl()}/bands/${bandId}/uploads/${sessionId}`,
        start,
        end,
        total,
        body,
        signal,
      ),
  };
}

export type { UploadSession };

/** Media linked to a song across gigs, grouped by gig (newest first). */
export function useSongMedia(bandId: string, songId: string | null) {
  return useQuery({
    queryKey: ["bands", bandId, "song-media", songId] as const,
    enabled: !!songId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () =>
      api(`/bands/${bandId}/songs/${songId}/media`, {
        schema: z.array(songMediaGroupSchema),
      }),
  });
}
