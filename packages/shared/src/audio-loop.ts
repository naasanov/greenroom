export const LOOP_BEGINNING = "beginning";
export const LOOP_END = "end";

export interface LoopPoint {
  id: string;
  label: string;
  positionMs: number;
}

export interface LoopRange {
  startId: string;
  endId: string;
  startMs: number;
  endMs: number;
}

/** Beginning, every marker (by position then id, clamped to the track), End. */
export function loopPoints(
  markers: readonly { id: string; title: string; positionMs: number }[],
  durationMs: number,
): LoopPoint[] {
  const end = Math.max(0, durationMs);
  const mid = markers
    .map((m) => ({
      id: m.id,
      label: m.title,
      positionMs: Math.min(end, Math.max(0, m.positionMs)),
    }))
    .sort(
      (a, b) =>
        a.positionMs - b.positionMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return [
    { id: LOOP_BEGINNING, label: "Beginning", positionMs: 0 },
    ...mid,
    { id: LOOP_END, label: "End", positionMs: end },
  ];
}

/** The stretch the playhead is in; a point at the playhead counts as the start. */
export function defaultLoopRange(
  points: LoopPoint[],
  playheadMs: number,
): { startId: string; endId: string } {
  let startIdx = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.positionMs <= playheadMs) startIdx = i;
  }
  const start = points[startIdx]!;
  const next =
    points.find((p) => p.positionMs > start.positionMs) ??
    points[points.length - 1]!;
  return { startId: start.id, endId: next.id };
}

/** Points strictly after the start point's position. */
export function endOptions(points: LoopPoint[], startId: string): LoopPoint[] {
  const start = points.find((p) => p.id === startId);
  if (!start) return [];
  return points.filter((p) => p.positionMs > start.positionMs);
}

/** Keeps the chosen range when still valid, else falls back to the playhead's stretch. */
export function resolveLoopRange(
  points: LoopPoint[],
  startId: string,
  endId: string,
  playheadMs: number,
): LoopRange {
  let range = { startId, endId };
  const valid =
    points.some((p) => p.id === startId) &&
    endOptions(points, startId).some((p) => p.id === endId);
  if (!valid) range = defaultLoopRange(points, playheadMs);
  const start = points.find((p) => p.id === range.startId)!;
  const end = points.find((p) => p.id === range.endId)!;
  return { ...range, startMs: start.positionMs, endMs: end.positionMs };
}
