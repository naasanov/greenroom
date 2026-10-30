import type { StageSnapshot } from "@/lib/queries/stage";

const SNAPSHOT_PREFIX = "greenroom.stage.gig.";
const POSITION_PREFIX = "greenroom.stage.position.";

export const stageShellPath = (gigId: string) => `/gigs/${gigId}/stage`;

export function readSnapshot(gigId: string): StageSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + gigId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StageSnapshot;
    return Array.isArray(parsed.songs) && parsed.setlistId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(snapshot: StageSnapshot): void {
  try {
    localStorage.setItem(
      SNAPSHOT_PREFIX + snapshot.gigId,
      JSON.stringify(snapshot),
    );
  } catch {
    // Blocked or full storage only costs offline support.
  }
}

/** Drops cached snapshots for gigs outside `keep`. */
export function pruneSnapshots(keep: ReadonlySet<string>): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key?.startsWith(SNAPSHOT_PREFIX) &&
        !keep.has(key.slice(SNAPSHOT_PREFIX.length))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Pruning is best effort.
  }
}

export function readPosition(setlistId: string): number {
  try {
    const n = Number(localStorage.getItem(POSITION_PREFIX + setlistId));
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writePosition(setlistId: string, index: number): void {
  try {
    localStorage.setItem(POSITION_PREFIX + setlistId, String(index));
  } catch {
    // The position then lasts for this page load only.
  }
}
