"use client";

import { useEffect } from "react";
import { useCurrentBand } from "@/lib/current-band";

const START_DELAY_MS = 8000;
const FRESH_MS = 30 * 60_000;
const SYNCED_KEY = "greenroom.stage.synced-at";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const recentlySynced = () => {
  try {
    const at = Number(localStorage.getItem(SYNCED_KEY));
    return at > 0 && Date.now() - at < FRESH_MS;
  } catch {
    return false;
  }
};

const markSynced = () => {
  try {
    localStorage.setItem(SYNCED_KEY, String(Date.now()));
  } catch {
    // Without storage the sync simply runs on the next load.
  }
};

/** Runs `cb` when the browser is idle, falling back to a timer. Returns a canceller. */
function onIdle(cb: () => void): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 10_000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1000);
  return () => window.clearTimeout(id);
}

/** Registers the service worker and refreshes the offline stage cache when idle and stale. */
export function StageOfflineSync() {
  const bandId = useCurrentBand().currentBand?.id;

  // Registration is cheap and must precede opening a stage page, so it only waits for idle.
  useEffect(() => {
    return onIdle(
      () => void import("./offline").then((m) => m.registerServiceWorker()),
    );
  }, []);

  useEffect(() => {
    if (!bandId) return;
    let cancelIdle: (() => void) | undefined;
    let cancelled = false;
    const sync = async (force: boolean) => {
      if (cancelled) return;
      const { syncUpcomingStageData } = await import("./offline");
      if (cancelled || !navigator.onLine) return;
      if (!force && recentlySynced()) return;
      await syncUpcomingStageData(bandId, onIdlePromise);
      markSynced();
    };
    const schedule = (force: boolean) => {
      cancelIdle?.();
      cancelIdle = onIdle(() => void sync(force));
    };
    const timer = window.setTimeout(() => schedule(false), START_DELAY_MS);
    const online = () => schedule(true);
    window.addEventListener("online", online);
    return () => {
      cancelled = true;
      cancelIdle?.();
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [bandId]);

  return null;
}

const onIdlePromise = () => new Promise<void>((resolve) => onIdle(resolve));
