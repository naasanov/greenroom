import { z } from "zod";
import type { CalendarEvent, SongDetail } from "@greenroom/shared";
import { api } from "@/lib/api";
import { fetchStageSnapshot } from "@/lib/queries/stage";
import { pruneSnapshots, stageShellPath, writeSnapshot } from "./stage-storage";

export const SHELL_CACHE = "greenroom-shell-v1";
const HORIZON_DAYS = 60;
const MAX_GIGS = 12;

const swEnabled = () =>
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SW === "1";

/** Registers the service worker; never throws. */
export async function registerServiceWorker(): Promise<void> {
  try {
    if (!swEnabled() || !("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Offline support is optional.
  }
}

/** Stores a gig's stage page and the scripts and styles it references. */
export async function cacheStageShell(gigId: string): Promise<void> {
  try {
    if (!swEnabled() || !("caches" in window)) return;
    const cache = await caches.open(SHELL_CACHE);
    const url = stageShellPath(gigId);
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(url, res);
    const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? []);
    await Promise.all(
      [...assets].map(async (asset) => {
        if (await cache.match(asset)) return;
        const r = await fetch(asset);
        if (r.ok) await cache.put(asset, r);
      }),
    );
  } catch {
    // Shell caching is best effort.
  }
}

/** True once the gig's stage page is in Cache Storage. */
export async function isShellCached(gigId: string): Promise<boolean> {
  try {
    if (!("caches" in window)) return false;
    const path = stageShellPath(gigId);
    // The service worker stores the route payload under "?rsc" when the page loads.
    const [page, payload] = await Promise.all([
      caches.match(path),
      caches.match(`${path}?rsc`, { ignoreVary: true }),
    ]);
    return !!page && !!payload;
  } catch {
    return false;
  }
}

/** Quietly stores setlists, song notes and the stage page for upcoming gigs. */
export async function syncUpcomingStageData(bandId: string): Promise<void> {
  try {
    const now = new Date();
    const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    const events = await api<CalendarEvent[]>(
      `/bands/${bandId}/events?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      { schema: z.custom<CalendarEvent[]>() },
    );
    const gigs = events.filter((e) => e.type === "gig").slice(0, MAX_GIGS);
    const songCache = new Map<string, Promise<SongDetail>>();
    const kept = new Set<string>();
    for (const gig of gigs) {
      try {
        const snap = await fetchStageSnapshot(bandId, gig.id, {
          gigTitle: gig.title,
          songCache,
        });
        if (!snap) continue;
        writeSnapshot(snap);
        kept.add(gig.id);
        await cacheStageShell(gig.id);
      } catch {
        kept.add(gig.id);
      }
    }
    pruneSnapshots(kept);
  } catch {
    // Offline or signed out: keep whatever is already cached.
  }
}
