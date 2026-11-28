import { Logger } from "@nestjs/common";
import { SUGGESTIBLE_REFERENCES } from "@greenroom/shared";
import type {
  MusicLinkAdapter,
  MusicLinkLinks,
  MusicLinkLookup,
} from "./musiclink.adapter.js";
import { httpRequest, parseRetryAfterSeconds } from "../http.js";

const log = new Logger("MusicLinkAdapter");
const RESOLVE_URL = "https://api.musiclink.one/v2/resolve";
// An uncached track can take 10 to 15 seconds to resolve.
const TIMEOUT_MS = 20_000;

interface MusicLinkItem {
  type?: unknown;
  platforms?: Record<string, unknown> | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** Seconds from a Retry-After header, in delta-seconds or HTTP-date form, capped at 24h. */
export const retryAfterOf = (
  res: Pick<Response, "headers">,
  now = Date.now(),
): number | undefined => {
  const seconds = parseRetryAfterSeconds(res.headers.get("retry-after"), now);
  if (!seconds) return undefined;
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
};

/** Resolves a track link through MusicLink, keeping only whitelisted platforms. */
export class RealMusicLinkAdapter implements MusicLinkAdapter {
  async findLinks(sourceUrl: string): Promise<MusicLinkLookup> {
    const key = process.env.MUSICLINK_API_KEY;
    if (!key) return { links: null };
    try {
      const params = new URLSearchParams({ q: sourceUrl });
      const res = await httpRequest(
        `${RESOLVE_URL}?${params}`,
        { headers: { Authorization: `Bearer ${key}` } },
        { timeoutMs: TIMEOUT_MS },
      );
      if (res.status === 404) return { links: {} };
      if (!res.ok) {
        log.warn(`link lookup failed status=${res.status}`);
        const retryAfterSeconds =
          res.status === 429 ? retryAfterOf(res) : undefined;
        return {
          links: null,
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        };
      }
      const body: unknown = await res.json();
      if (!isObj(body) || body.success === false || !Array.isArray(body.data)) {
        return { links: null };
      }
      const track = (body.data as unknown[]).find(
        (item): item is MusicLinkItem => isObj(item) && item.type === "track",
      );
      if (!track) return { links: {} };
      if (track.platforms != null && !isObj(track.platforms)) {
        return { links: null };
      }
      const out: MusicLinkLinks = {};
      for (const ref of SUGGESTIBLE_REFERENCES) {
        const url = track.platforms?.[ref.musiclink];
        if (typeof url === "string" && /^https:\/\//i.test(url)) {
          out[ref.musiclink] = url;
        }
      }
      return { links: out };
    } catch (err) {
      log.warn(
        `link lookup errored: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { links: null };
    }
  }
}
