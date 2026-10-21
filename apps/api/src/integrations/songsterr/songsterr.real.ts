import type { SongsterrAdapter } from "./songsterr.adapter.js";

const SEARCH_URL = "https://www.songsterr.com/api/songs";
const TIMEOUT_MS = 5000;

interface SongsterrHit {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
}

const norm = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const artistName = (a: unknown): string => {
  if (typeof a === "string") return a;
  if (a && typeof a === "object" && "name" in a) {
    const name = (a as { name: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
};

/** Searches Songsterr's public endpoint; any failure means no suggestion. */
export class RealSongsterrAdapter implements SongsterrAdapter {
  async searchTab(input: {
    title: string;
    artist?: string;
  }): Promise<{ url: string } | null> {
    const title = norm(input.title);
    if (!title) return null;
    const artist = input.artist ? norm(input.artist) : "";
    try {
      const pattern = `${input.title} ${input.artist ?? ""}`.trim();
      const res = await fetch(
        `${SEARCH_URL}?pattern=${encodeURIComponent(pattern)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) return null;
      const hits = (await res.json()) as SongsterrHit[];
      if (!Array.isArray(hits)) return null;
      const hit = hits.find((h) => {
        if (typeof h.id !== "number" || typeof h.title !== "string") {
          return false;
        }
        if (norm(h.title) !== title) return false;
        return !artist || norm(artistName(h.artist)).includes(artist);
      });
      if (!hit) return null;
      const slug = norm(`${artistName(hit.artist)} ${hit.title as string}`)
        .replace(/ /g, "-")
        .slice(0, 120);
      return {
        url: `https://www.songsterr.com/a/wsa/${slug}-tab-s${hit.id as number}`,
      };
    } catch {
      return null;
    }
  }
}
