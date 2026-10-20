"use client";

import { RosterTab } from "@/components/onboarding/roster-tab";
import { useCurrentBand } from "@/lib/current-band";

export default function RosterPage() {
  const { currentBand } = useCurrentBand();
  return currentBand ? <RosterTab band={currentBand} /> : null;
}
