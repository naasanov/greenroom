"use client";

import type { AudioMarker } from "@greenroom/shared";
import { cn } from "@/lib/utils";
import { formatTime } from "./format-time";

/** Scrollable list of a file's markers shown under the waveform. */
export function MarkerList({
  markers,
  activeId,
  onSelect,
}: {
  markers: readonly AudioMarker[];
  activeId: string | null;
  onSelect(id: string): void;
}) {
  if (markers.length === 0) {
    return (
      <p data-testid="marker-empty" className="px-1 py-3 text-sm text-white/60">
        No markers yet. Tap Add marker while listening to drop one at the
        playhead.
      </p>
    );
  }
  return (
    <ul
      aria-label="Markers"
      className="flex max-h-full min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain"
    >
      {markers.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            data-testid="marker-row"
            data-title={m.title}
            aria-pressed={m.id === activeId}
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60",
              m.id === activeId ? "bg-white/15" : "bg-white/5",
            )}
          >
            <span className="shrink-0 font-mono text-sm tabular-nums text-white/80">
              {formatTime(m.positionMs, true)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.title}
              </span>
              <span className="block truncate text-xs text-white/60">
                {m.createdBy
                  ? `added by ${m.createdBy.displayName}`
                  : "added by a former member"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
