export const YOUTUBE_ERROR_CODES = {
  loginRequired: "YOUTUBE_LOGIN_REQUIRED",
  quotaExceeded: "YOUTUBE_QUOTA_EXCEEDED",
  noChannel: "YOUTUBE_NO_CHANNEL",
} as const;

/** Songs saved to one YouTube playlist; each added video costs API quota. */
export const YOUTUBE_PLAYLIST_MAX = 50;

/** Consent scope for creating and editing the user's playlists. */
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";

export interface YoutubeStatus {
  connected: boolean;
  /** The Google account the connection was made with. */
  displayName: string | null;
}

export interface YoutubeExportResult {
  playlistId: string;
  playlistUrl: string;
  name: string;
  exported: number;
  /** Songs without a usable YouTube link, or that YouTube refused, in export order. */
  skipped: { songId: string; title: string }[];
  /** Linked songs beyond the playlist size cap that were not added. */
  leftOut: number;
}

/** The video id in a YouTube watch, short, embed or youtu.be link; null if none. */
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
