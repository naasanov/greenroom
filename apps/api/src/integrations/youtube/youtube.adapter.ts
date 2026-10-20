export const YOUTUBE = Symbol("YOUTUBE");

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

export type YoutubeVideoResult =
  { status: "ok"; video: YoutubeVideo } | { status: "not-found" };

export interface YoutubeAdapter {
  /** oEmbed-style lookup from a youtube.com or youtu.be URL. */
  getVideoMetadata(url: string): Promise<YoutubeVideoResult>;
}

/** Extracts the video id from common YouTube URL shapes; null if none. */
export function parseYoutubeId(url: string): string | null {
  const m =
    /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(url) ??
    /youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/.exec(
      url,
    );
  return m?.[1] ?? null;
}
