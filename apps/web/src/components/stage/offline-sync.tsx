"use client";

import { useEffect } from "react";
import { useCurrentBand } from "@/lib/current-band";
import { registerServiceWorker, syncUpcomingStageData } from "./offline";

/** Registers the service worker and refreshes the offline stage cache while online. */
export function StageOfflineSync() {
  const bandId = useCurrentBand().currentBand?.id;

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!bandId) return;
    const run = () => {
      if (navigator.onLine) void syncUpcomingStageData(bandId);
    };
    const timer = window.setTimeout(run, 2000);
    window.addEventListener("online", run);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", run);
    };
  }, [bandId]);

  return null;
}
