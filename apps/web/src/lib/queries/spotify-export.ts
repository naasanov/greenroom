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

/** YouTube caps a watch_videos queue at 50 ids. */
export const YOUTUBE_QUEUE_MAX = 50;

/** The video id in a YouTube watch, short, embed or youtu.be link. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com") {
    const [, kind, rest] = u.pathname.split("/");
    id =
      kind === "watch"
        ? u.searchParams.get("v")
        : kind === "shorts" || kind === "embed" || kind === "live"
          ? (rest ?? null)
          : null;
  }
  return id && /^[\w-]{5,32}$/.test(id) ? id : null;
}

export interface YoutubeQueue {
  /** Link that opens the included songs as a temporary queue, null if none. */
  url: string | null;
  included: number;
  /** Titles without a usable YouTube link. */
  noLink: string[];
  /** Titles dropped because the queue is full. */
  overflow: string[];
}

/** Builds a no-login YouTube queue link from songs' YouTube links. */
export function buildYoutubeQueue(
  songs: { title: string; youtubeUrl: string | null }[],
): YoutubeQueue {
  const ids: string[] = [];
  const seen = new Set<string>();
  const noLink: string[] = [];
  const overflow: string[] = [];
  for (const song of songs) {
    const id = youtubeVideoId(song.youtubeUrl);
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
