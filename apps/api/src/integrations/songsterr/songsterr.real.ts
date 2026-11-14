import { Logger } from "@nestjs/common";
import type { SongsterrAdapter, SongsterrTabs } from "./songsterr.adapter.js";

const log = new Logger("SongsterrAdapter");
const SEARCH_URL = "https://www.songsterr.com/api/songs";
const TIMEOUT_MS = 4000;

interface Hit {
  songId?: number;
  id?: number;
  title: string;
  artist: string | { name: string };
  tracks?: { instrument?: unknown; name?: unknown }[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isHit = (v: unknown): v is Hit =>
  isObj(v) &&
  typeof v.title === "string" &&
  (typeof v.artist === "string" ||
    (isObj(v.artist) && typeof v.artist.name === "string")) &&
  (v.tracks === undefined ||
    (Array.isArray(v.tracks) && v.tracks.every(isObj)));

const norm = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Searches Songsterr's unofficial endpoint; any failure means no tabs. */
export class RealSongsterrAdapter implements SongsterrAdapter {
  async findTabs(input: {
    title: string;
    artist?: string;
  }): Promise<SongsterrTabs | null> {
    const title = norm(input.title);
    if (!title) return {};
    const artist = input.artist ? norm(input.artist) : "";
    try {
      const pattern = `${input.title} ${input.artist ?? ""}`.trim();
      const res = await fetch(
        `${SEARCH_URL}?pattern=${encodeURIComponent(pattern)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) {
        log.warn(`tab search failed status=${res.status}`);
        return null;
      }
      const body: unknown = await res.json();
      if (!Array.isArray(body) || !body.every(isHit)) return null;
      const hit = body.find(
        (h) =>
          norm(h.title) === title &&
          (!artist || norm(artistName(h.artist)).includes(artist)),
      );
      return hit ? tabsFor(hit) : {};
    } catch (err) {
      log.warn(
        `tab search errored: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

const strOf = (v: unknown): string => (typeof v === "string" ? v : "");

const artistName = (a: Hit["artist"]): string =>
  typeof a === "string" ? a : a.name;

function tabsFor(hit: Hit): SongsterrTabs {
  const id = hit.songId ?? hit.id;
  if (id === undefined) return {};
  const slug = norm(`${artistName(hit.artist)} ${hit.title}`)
    .replace(/ /g, "-")
    .slice(0, 120);
  const tracks = hit.tracks ?? [];
  const find = (match: (kind: string) => boolean): number =>
    tracks.findIndex((t) =>
      match(norm(`${strOf(t.instrument)} ${strOf(t.name)}`)),
    );
  const bass = find((k) => k.includes("bass"));
  const guitar = find((k) => k.includes("guitar") && !k.includes("bass"));
  const base = `https://www.songsterr.com/a/wsa/${slug}`;
  return {
    ...(bass >= 0 ? { bass: `${base}-bass-tab-s${id}t${bass}` } : {}),
    ...(guitar >= 0 ? { guitar: `${base}-tab-s${id}t${guitar}` } : {}),
  };
}
