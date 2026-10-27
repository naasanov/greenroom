"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { ExportResult, Gig, SongSort } from "@greenroom/shared";
import { api, getApiUrl } from "@/lib/api";

export type ExportTarget =
  { kind: "library"; sort: SongSort } | { kind: "setlist"; setlistId: string };

/** Creates a private Spotify playlist from the library or a setlist. */
export function useExportToSpotify(bandId: string) {
  return useMutation({
    mutationFn: ({ target, name }: { target: ExportTarget; name: string }) =>
      api(
        target.kind === "library"
          ? `/bands/${bandId}/songs/export`
          : `/bands/${bandId}/setlists/${target.setlistId}/export`,
        {
          method: "POST",
          body:
            target.kind === "library" ? { name, sort: target.sort } : { name },
          schema: z.custom<ExportResult>(),
        },
      ),
  });
}

/** Title and date of a gig, for naming its exported playlist. */
export function useGigForExport(bandId: string, gigId: string | null) {
  return useQuery({
    queryKey: ["bands", bandId, "gigs", gigId, "export-name"],
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}`, { schema: z.custom<Gig>() }),
    enabled: !!gigId,
    staleTime: 60_000,
  });
}

/** Sends the browser through Spotify login asking for playlist-modify scopes. */
export function connectSpotifyForExport(redirectTo: string) {
  const qs = new URLSearchParams({ redirectTo, scopes: "export" });
  window.location.assign(`${getApiUrl()}/integrations/spotify/start?${qs}`);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-14" becomes "Nov 14 2026"; anything else comes back null. */
export function exportDateLabel(
  date: string | null | undefined,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[3])} ${m[1]}` : null;
}
