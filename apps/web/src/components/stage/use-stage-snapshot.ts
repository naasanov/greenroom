"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isApiError } from "@/lib/api";
import {
  fetchGigBandId,
  fetchStageSnapshot,
  type StageSnapshot,
} from "@/lib/queries/stage";
import { signInUrl } from "@/lib/redirect";
import { cacheStageShell, isShellCached } from "./offline";
import { readSnapshot, stageShellPath, writeSnapshot } from "./stage-storage";

export interface StageData {
  snapshot: StageSnapshot | null;
  status: "loading" | "ready" | "empty" | "error";
  /** The device holds both the setlist and the page needed to open it offline. */
  offlineReady: boolean;
}

/** Cached snapshot first, then a live refresh when online. */
export function useStageSnapshot(gigId: string): StageData {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<StageSnapshot | null>(null);
  const [status, setStatus] = useState<StageData["status"]>("loading");
  const [shellCached, setShellCached] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readSnapshot(gigId);
    (async () => {
      if (cached) {
        setSnapshot(cached);
        setStatus("ready");
      }
      if (!navigator.onLine) {
        if (!cached && !cancelled) setStatus("error");
        return;
      }
      try {
        const bandId = cached?.bandId ?? (await fetchGigBandId(gigId));
        const live = await fetchStageSnapshot(bandId, gigId);
        if (cancelled) return;
        if (!live) {
          setSnapshot(null);
          setStatus("empty");
          return;
        }
        writeSnapshot(live);
        setSnapshot(live);
        setStatus("ready");
        void cacheStageShell(gigId);
      } catch (e) {
        if (cancelled || cached) return;
        if (isApiError(e, 401)) {
          router.replace(signInUrl(stageShellPath(gigId)));
        } else {
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gigId, router]);

  // A page that loaded before the worker took control reloads once so the worker caches its payload.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const onChange = () => window.location.reload();
    sw.addEventListener("controllerchange", onChange);
    return () => sw.removeEventListener("controllerchange", onChange);
  }, []);

  useEffect(() => {
    if (!snapshot || shellCached) return;
    let cancelled = false;
    const check = async () => {
      if (await isShellCached(gigId)) {
        if (!cancelled) setShellCached(true);
      }
    };
    void check();
    const timer = window.setInterval(check, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gigId, snapshot, shellCached]);

  return { snapshot, status, offlineReady: !!snapshot && shellCached };
}
