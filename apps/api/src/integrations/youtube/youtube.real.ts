import {
  parseYoutubeId,
  type YoutubeAdapter,
  type YoutubeVideoResult,
} from "./youtube.adapter.js";

const OEMBED_URL = "https://www.youtube.com/oembed";
const TIMEOUT_MS = 5000;

interface OEmbed {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
}

/** Looks videos up through YouTube's keyless oEmbed endpoint. */
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
      if (!res.ok) return { status: "not-found" };
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
        },
      };
    } catch {
      // Timeouts and network failures read as "no result".
      return { status: "not-found" };
    }
  }
}
