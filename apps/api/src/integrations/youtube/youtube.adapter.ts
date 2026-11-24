export const YOUTUBE = Symbol("YOUTUBE");

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  /** Length in whole seconds; null when unavailable or not looked up. */
  durationSeconds: number | null;
}

export type YoutubeVideoResult =
  { status: "ok"; video: YoutubeVideo } | { status: "not-found" };

export interface YoutubePlaylist {
  id: string;
  url: string;
  name: string;
}

/** `quota-exceeded` is the Data API's daily quota running out; `no-channel` is an account without a YouTube channel. */
export type YoutubeCreatePlaylistResult =
  | { status: "ok"; playlist: YoutubePlaylist }
  | { status: "unauthorized" }
  | { status: "quota-exceeded" }
  | { status: "no-channel" };

/** `rejected` holds ids YouTube refused (removed, private or unknown videos). */
export type YoutubeAddItemsResult =
  | { status: "ok"; added: string[]; rejected: string[] }
  | { status: "unauthorized" }
  | { status: "quota-exceeded" }
  | { status: "not-found" };

export interface YoutubeAdapter {
  /** oEmbed-style lookup from a youtube.com or youtu.be URL. */
  getVideoMetadata(url: string): Promise<YoutubeVideoResult>;

  /** User-level operations take the user's Google access token. */
  createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<YoutubeCreatePlaylistResult>;
  /** Appends videos in the given order, one at a time. */
  addPlaylistItems(
    userToken: string,
    playlistId: string,
    videoIds: string[],
  ): Promise<YoutubeAddItemsResult>;
}

export const youtubePlaylistUrl = (id: string): string =>
  `https://www.youtube.com/playlist?list=${id}`;

/** Extracts the video id from common YouTube URL shapes; null if none. */
export function parseYoutubeId(url: string): string | null {
  const m =
    /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(url) ??
    /youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

/** Parses an ISO 8601 duration such as PT1H2M3S or PT45S into seconds; null if malformed. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m || iso === "P" || iso.endsWith("T")) return null;
  const [d, h, min, sec] = [m[1], m[2], m[3], m[4]].map((v) => Number(v ?? 0));
  return d! * 86400 + h! * 3600 + min! * 60 + sec!;
}
