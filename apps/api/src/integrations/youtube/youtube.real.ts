import { Logger } from "@nestjs/common";
import {
  parseIsoDuration,
  parseYoutubeId,
  youtubePlaylistUrl,
  type YoutubeAddItemsResult,
  type YoutubeAdapter,
  type YoutubeCreatePlaylistResult,
  type YoutubeVideoResult,
} from "./youtube.adapter.js";

const log = new Logger("YoutubeAdapter");
const OEMBED_URL = "https://www.youtube.com/oembed";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";
const PLAYLIST_ITEMS_URL =
  "https://www.googleapis.com/youtube/v3/playlistItems";
const TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 10000;
const ID_PATTERN = /^[\w-]{1,64}$/;
const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);
const VIDEO_REJECTED_REASONS = new Set([
  "videoNotFound",
  "forbidden",
  "playlistItemsNotAccessible",
  "videoAlreadyInPlaylist",
]);

interface ApiErrorBody {
  error?: { errors?: { reason?: unknown }[] };
}

/** The first error reason of a Data API error response, or null. */
async function errorReason(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const reason = body?.error?.errors?.[0]?.reason;
  return typeof reason === "string" ? reason : null;
}

async function postJson(
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
}

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

  /** playlists.insert (50 quota units); the playlist is private unless `isPublic`. */
  async createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<YoutubeCreatePlaylistResult> {
    const res = await postJson(
      `${PLAYLISTS_URL}?part=snippet,status`,
      userToken,
      {
        snippet: { title: input.name, description: input.description ?? "" },
        status: { privacyStatus: input.isPublic ? "public" : "private" },
      },
    );
    if (!res.ok) {
      const reason = await errorReason(res);
      if (reason && QUOTA_REASONS.has(reason)) {
        return { status: "quota-exceeded" };
      }
      if (reason === "youtubeSignupRequired") return { status: "no-channel" };
      if (res.status === 401 || res.status === 403) {
        return { status: "unauthorized" };
      }
      throw new Error(`YouTube playlists.insert failed (${res.status})`);
    }
    const data = (await res.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    if (typeof data?.id !== "string" || !ID_PATTERN.test(data.id)) {
      throw new Error("YouTube playlists.insert returned no playlist id");
    }
    return {
      status: "ok",
      playlist: {
        id: data.id,
        url: youtubePlaylistUrl(data.id),
        name: input.name,
      },
    };
  }

  /** playlistItems.insert per video (50 quota units each), sequential to keep order. */
  async addPlaylistItems(
    userToken: string,
    playlistId: string,
    videoIds: string[],
  ): Promise<YoutubeAddItemsResult> {
    const added: string[] = [];
    const rejected: string[] = [];
    for (const videoId of videoIds) {
      const res = await postJson(
        `${PLAYLIST_ITEMS_URL}?part=snippet`,
        userToken,
        {
          snippet: {
            playlistId,
            resourceId: { kind: "youtube#video", videoId },
          },
        },
      );
      if (res.ok) {
        added.push(videoId);
        continue;
      }
      const reason = await errorReason(res);
      if (reason && QUOTA_REASONS.has(reason)) {
        log.warn(
          `playlistItems.insert quota exhausted after ${added.length} of ${videoIds.length} videos`,
        );
        return { status: "quota-exceeded" };
      }
      if (reason === "playlistNotFound") return { status: "not-found" };
      if (reason && VIDEO_REJECTED_REASONS.has(reason)) {
        rejected.push(videoId);
      } else if (res.status === 401 || res.status === 403) {
        return { status: "unauthorized" };
      } else if (res.status === 404 || res.status === 400) {
        rejected.push(videoId);
      } else {
        throw new Error(`YouTube playlistItems.insert failed (${res.status})`);
      }
    }
    return { status: "ok", added, rejected };
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
