"use client";

import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Holds a screen wake lock while `active`, re-acquiring it when the tab becomes visible again. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (
      navigator as unknown as {
        wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const s = await wakeLock.request("screen");
        if (stopped) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        // Denied (low battery, hidden tab): the next visibility change retries.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
