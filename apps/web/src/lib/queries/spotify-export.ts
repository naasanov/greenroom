"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  youtubeVideoId,
  type ExportResult,
  type Gig,
  type SongSort,
} from "@greenroom/shared";
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

/** YouTube caps a watch_videos queue at 50 ids. */
export const YOUTUBE_QUEUE_MAX = 50;

export interface YoutubeQueue {
  /** Link that opens the included songs as a temporary queue, null if none. */
  url: string | null;
  included: number;
  /** Titles without a usable YouTube link. */
  noLink: string[];
  /** Titles dropped because the queue is full. */
  overflow: string[];
}

/** Builds a no-login YouTube queue link from songs' YouTube or YouTube Music links. */
export function buildYoutubeQueue(
  songs: {
    title: string;
    youtubeUrl: string | null;
    youtubeMusicUrl: string | null;
  }[],
): YoutubeQueue {
  const ids: string[] = [];
  const seen = new Set<string>();
  const noLink: string[] = [];
  const overflow: string[] = [];
  for (const song of songs) {
    const id =
      youtubeVideoId(song.youtubeUrl) ?? youtubeVideoId(song.youtubeMusicUrl);
    if (!id) noLink.push(song.title);
    else if (seen.has(id)) continue;
    else if (ids.length >= YOUTUBE_QUEUE_MAX) overflow.push(song.title);
    else {
      seen.add(id);
      ids.push(id);
    }
  }
  return {
    url: ids.length
      ? `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`
      : null,
    included: ids.length,
    noLink,
    overflow,
  };
}
