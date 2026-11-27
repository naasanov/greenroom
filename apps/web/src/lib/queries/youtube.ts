"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  YOUTUBE_ERROR_CODES,
  type YoutubeExportResult,
  type YoutubeStatus,
} from "@greenroom/shared";
import { api, getApiUrl, isApiError } from "@/lib/api";
import type { ExportTarget } from "@/lib/queries/spotify-export";

export const youtubeKey = ["integrations", "youtube"] as const;

/** Whether the signed-in user has connected YouTube for saved playlists. */
export function useYoutubeStatus() {
  return useQuery({
    queryKey: youtubeKey,
    queryFn: () =>
      api("/integrations/youtube", { schema: z.custom<YoutubeStatus>() }),
  });
}

export function useDisconnectYoutube() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/integrations/youtube", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: youtubeKey }),
  });
}

/** Sends the browser through the YouTube connect flow, returning to `redirectTo`. */
export function connectYoutube(redirectTo: string) {
  const qs = new URLSearchParams({ redirectTo });
  window.location.assign(`${getApiUrl()}/integrations/youtube/start?${qs}`);
}

/** Saves the library or a setlist as a playlist in the connected YouTube account. */
export function useExportToYoutube(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, name }: { target: ExportTarget; name: string }) =>
      api(
        target.kind === "library"
          ? `/bands/${bandId}/songs/export/youtube`
          : `/bands/${bandId}/setlists/${target.setlistId}/export/youtube`,
        {
          method: "POST",
          body:
            target.kind === "library" ? { name, sort: target.sort } : { name },
          schema: z.custom<YoutubeExportResult>(),
        },
      ),
    onError: (e) => {
      // A revoked connection flips the dialog back to the connect prompt.
      if (isApiError(e, 409) && e.code === YOUTUBE_ERROR_CODES.loginRequired) {
        void qc.invalidateQueries({ queryKey: youtubeKey });
      }
    },
  });
}
