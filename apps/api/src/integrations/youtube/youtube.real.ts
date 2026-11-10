import { Logger } from "@nestjs/common";
import {
  parseIsoDuration,
  parseYoutubeId,
  type YoutubeAdapter,
  type YoutubeVideoResult,
} from "./youtube.adapter.js";

const log = new Logger("YoutubeAdapter");
const OEMBED_URL = "https://www.youtube.com/oembed";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const TIMEOUT_MS = 5000;

interface OEmbed {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
}

/** Looks videos up through keyless oEmbed; duration comes from the Data API when YOUTUBE_API_KEY is set. */
export class RealYoutubeAdapter implements YoutubeAdapter {
  async getVideoMetadata(url: string): Promise<YoutubeVideoResult> {
    const videoId = parseYoutubeId(url);
    if (!videoId) return { status: "not-found" };
    try {
      const canonical = `https://www.youtube.com/watch?v=${videoId}`;
      const res = await fetch(
        `${OEMBED_URL}?url=${encodeURIComponent(canonical)}&format=json`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) {
        // 401/403/404 mean private, removed or unembeddable; other statuses are upstream trouble.
        if (![401, 403, 404].includes(res.status)) {
          log.warn(
            `oEmbed lookup failed videoId=${videoId} status=${res.status}`,
          );
        }
        return { status: "not-found" };
      }
      const data = (await res.json()) as OEmbed;
      if (typeof data.title !== "string" || !data.title) {
        return { status: "not-found" };
      }
      return {
        status: "ok",
        video: {
          videoId,
          title: data.title,
          channelName:
            typeof data.author_name === "string" ? data.author_name : "",
          thumbnailUrl:
            typeof data.thumbnail_url === "string"
              ? data.thumbnail_url
              : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationSeconds: await this.duration(videoId),
        },
      };
    } catch (err) {
      // Timeouts and network failures read as "no result".
      log.warn(
        `oEmbed lookup errored videoId=${videoId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: "not-found" };
    }
  }

  /** videos.list part=contentDetails; null without a key, on errors, or for missing videos. */
  private async duration(videoId: string): Promise<number | null> {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return null;
    try {
      const res = await fetch(
        `${VIDEOS_URL}?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) {
        log.warn(`videos.list failed videoId=${videoId} status=${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        items?: { contentDetails?: { duration?: unknown } }[];
      };
      const iso = data.items?.[0]?.contentDetails?.duration;
      return typeof iso === "string" ? parseIsoDuration(iso) : null;
    } catch (err) {
      log.warn(
        `videos.list errored videoId=${videoId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
