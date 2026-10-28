"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { UploadStore, type UploadEntry } from "./upload-store";
import { useWakeLock } from "./use-wake-lock";

const UploadContext = createContext<UploadStore | null>(null);

/** Mounts the upload queue above the routes so uploads survive leaving the gallery. */
export function UploadProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [store] = useState(() => new UploadStore(qc));
  const entries = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useWakeLock(
    entries.some((e) => e.status === "queued" || e.status === "uploading"),
  );
  return (
    <UploadContext.Provider value={store}>{children}</UploadContext.Provider>
  );
}

const EMPTY: UploadEntry[] = [];

/** The shared store plus this gig's entries (re-rendered on every change). */
export function useGigUploads(gigId: string) {
  const store = useContext(UploadContext);
  if (!store) throw new Error("UploadProvider is missing");
  const all = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY,
  );
  const entries = all.filter((e) => e.gigId === gigId);
  return { store, entries, defaults: store.getDefaults(gigId) };
}

export function useUploadStore(): UploadStore {
  const store = useContext(UploadContext);
  if (!store) throw new Error("UploadProvider is missing");
  return store;
}
