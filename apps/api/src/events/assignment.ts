export interface AssignmentRow {
  effectiveFrom: Date;
  scope: "forward" | "single";
  /** Null marks an explicit "no setlist". */
  setlistId: string | null;
}

export interface ResolvedAssignment {
  setlistId: string | null;
  source: "single" | "forward" | null;
  /** Start of the row the setlist comes from, null when none applies. */
  effectiveFrom: Date | null;
}

/**
 * Setlist for the occurrence starting at `occurrence`: a single row at exactly that
 * start wins, else the latest forward row with effective_from <= occurrence.
 */
export function resolveAssignment(
  rows: readonly AssignmentRow[],
  occurrence: Date,
): ResolvedAssignment {
  const t = occurrence.getTime();
  const single = rows.find(
    (r) => r.scope === "single" && r.effectiveFrom.getTime() === t,
  );
  if (single)
    return {
      setlistId: single.setlistId,
      source: "single",
      effectiveFrom: single.effectiveFrom,
    };
  let best: AssignmentRow | null = null;
  for (const r of rows) {
    if (r.scope !== "forward" || r.effectiveFrom.getTime() > t) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best
    ? {
        setlistId: best.setlistId,
        source: "forward",
        effectiveFrom: best.effectiveFrom,
      }
    : { setlistId: null, source: null, effectiveFrom: null };
}

/** True when the resolved (non-null) setlist comes from a row starting exactly at `occurrence`. */
export function startsHere(
  resolved: ResolvedAssignment,
  occurrence: Date,
): boolean {
  return (
    resolved.setlistId !== null &&
    resolved.effectiveFrom !== null &&
    resolved.effectiveFrom.getTime() === occurrence.getTime()
  );
}
