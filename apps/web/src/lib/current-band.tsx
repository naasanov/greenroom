"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BandSummary } from "@greenroom/shared";

const STORAGE_KEY = "gr_current_band";

export function getStoredBandId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the band outside React, e.g. right after accepting an invite. */
export function storeBandId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable: the first band is used as the fallback.
  }
}

interface CurrentBandValue {
  bands: BandSummary[];
  /** The stored band if the user still belongs to it, else their first band. */
  currentBand: BandSummary | null;
  setCurrentBandId: (id: string) => void;
}

const CurrentBandContext = createContext<CurrentBandValue | null>(null);

export function CurrentBandProvider({
  bands,
  children,
}: {
  bands: BandSummary[];
  children: ReactNode;
}) {
  const [storedId, setStoredId] = useState<string | null>(getStoredBandId);
  const setCurrentBandId = useCallback((id: string) => {
    storeBandId(id);
    setStoredId(id);
  }, []);
  const value = useMemo<CurrentBandValue>(
    () => ({
      bands,
      currentBand: bands.find((b) => b.id === storedId) ?? bands[0] ?? null,
      setCurrentBandId,
    }),
    [bands, storedId, setCurrentBandId],
  );
  return (
    <CurrentBandContext.Provider value={value}>
      {children}
    </CurrentBandContext.Provider>
  );
}

export function useCurrentBand(): CurrentBandValue {
  const ctx = useContext(CurrentBandContext);
  if (!ctx)
    throw new Error("useCurrentBand must be used inside the app layout");
  return ctx;
}
