import { isSuggestionSourceUrl } from "@greenroom/shared";

const YOUTUBE_WATCH_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "music.youtube.com",
]);

/**
 * The cache key for a source link: allowed hosts only, lower-case host, no
 * fragment or tracking query, no trailing slash. YouTube keeps its video id
 * and Apple Music keeps `i` (the track within an album). Null means rejected.
 */
export function normalizeSourceUrl(raw: string | undefined): string | null {
  if (!raw || !isSuggestionSourceUrl(raw)) return null;
  const url = new URL(raw.trim());
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  if (YOUTUBE_WATCH_HOSTS.has(host) && path === "/watch") {
    const v = url.searchParams.get("v");
    return v ? `https://${host}/watch?v=${v}` : `https://${host}/watch`;
  }
  if (host === "music.apple.com") {
    const track = url.searchParams.get("i");
    return `https://${host}${path}${track ? `?i=${track}` : ""}`;
  }
  return `https://${host}${path}`;
}
