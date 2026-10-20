"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { BandSummary } from "@greenroom/shared";
import { useMe, useSetCurrentBand } from "@/lib/queries";

interface CurrentBandValue {
  bands: BandSummary[];
  /** The user's server-side current band if still a member, else their first band. */
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
  const lastBandId = useMe().data?.lastBandId ?? null;
  const { mutate } = useSetCurrentBand();
  const setCurrentBandId = useCallback((id: string) => mutate(id), [mutate]);
  const value = useMemo<CurrentBandValue>(
    () => ({
      bands,
      currentBand: bands.find((b) => b.id === lastBandId) ?? bands[0] ?? null,
      setCurrentBandId,
    }),
    [bands, lastBandId, setCurrentBandId],
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
