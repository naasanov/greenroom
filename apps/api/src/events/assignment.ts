export interface AssignmentRow {
  effectiveFrom: Date;
  scope: "forward" | "single";
  setlistId: string;
}

export interface ResolvedAssignment {
  setlistId: string | null;
  source: "single" | "forward" | null;
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
  if (single) return { setlistId: single.setlistId, source: "single" };
  let best: AssignmentRow | null = null;
  for (const r of rows) {
    if (r.scope !== "forward" || r.effectiveFrom.getTime() > t) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best
    ? { setlistId: best.setlistId, source: "forward" }
    : { setlistId: null, source: null };
}
