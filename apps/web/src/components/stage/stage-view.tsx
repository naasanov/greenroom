"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/components/media/upload/use-wake-lock";
import { readPosition, writePosition } from "./stage-storage";
import { useStageSnapshot } from "./use-stage-snapshot";

const SWIPE_PX = 50;
const TAP_SLOP_PX = 10;

/** Full-screen dark reading view: one song at a time, tap to advance, swipe right to go back. */
export function StageView({ gigId }: { gigId: string }) {
  const router = useRouter();
  const { snapshot, status, offlineReady } = useStageSnapshot(gigId);
  useWakeLock(true);

  const setlistId = snapshot?.setlistId;
  const count = snapshot?.songs.length ?? 0;
  const [index, setIndex] = useState(0);
  const [restored, setRestored] = useState<string | null>(null);

  // Resume the saved song once per setlist, clamped to the current length.
  if (setlistId && restored !== setlistId && count > 0) {
    setRestored(setlistId);
    setIndex(Math.min(readPosition(setlistId), count - 1));
  }
  const current = Math.min(index, Math.max(count - 1, 0));

  useEffect(() => {
    if (setlistId && restored === setlistId) writePosition(setlistId, current);
  }, [setlistId, restored, current]);

  const advance = useCallback(
    () => setIndex(Math.min(current + 1, count - 1)),
    [current, count],
  );
  const back = useCallback(() => setIndex(Math.max(current - 1, 0)), [current]);

  const exit = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace(`/gigs/${gigId}`);
  }, [router, gigId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") advance();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") back();
      else if (e.key === "Escape") exit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, exit]);

  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerUp = (e: React.PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) back();
      else advance();
    } else if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
      advance();
    }
  };

  const song = snapshot?.songs[current];
  const next = snapshot?.songs[current + 1];

  return (
    <div
      data-testid="stage-view"
      role="application"
      aria-label="Stage mode"
      className="fixed inset-0 z-50 flex touch-pan-y select-none flex-col overflow-hidden bg-black text-white"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] text-neutral-400">
        <button
          type="button"
          aria-label="Exit stage mode"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={exit}
          className="flex size-11 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="size-6" />
        </button>
        <div className="flex min-w-0 flex-col items-end text-sm">
          <span data-testid="stage-position" className="font-medium">
            {song ? `${current + 1} of ${count}` : ""}
          </span>
          {offlineReady ? (
            <span data-testid="stage-offline" className="text-emerald-400">
              Available offline
            </span>
          ) : null}
        </div>
      </header>

      {song ? (
        <>
          <main className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto px-6 py-6">
            <h1
              data-testid="stage-title"
              className="text-5xl leading-tight font-bold break-words sm:text-7xl"
            >
              {song.title}
            </h1>
            {song.notes ? (
              <p
                data-testid="stage-notes"
                className="text-2xl leading-snug whitespace-pre-wrap text-neutral-200 sm:text-4xl"
              >
                {song.notes}
              </p>
            ) : null}
          </main>
          <footer
            data-testid="stage-next"
            className="border-t border-neutral-800 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
          >
            <p className="text-xs tracking-wide text-neutral-500 uppercase">
              {next ? "Next" : "End of setlist"}
            </p>
            {next ? (
              <p className="truncate text-2xl text-neutral-300">{next.title}</p>
            ) : null}
          </footer>
        </>
      ) : (
        <main className="flex flex-1 items-center justify-center px-6 text-center text-xl text-neutral-300">
          {status === "loading" ? (
            <Loader2 aria-label="Loading" className="size-8 animate-spin" />
          ) : status === "empty" ? (
            "This gig has no setlist yet."
          ) : (
            "Stage mode is not available for this gig. Open it once while online."
          )}
        </main>
      )}
    </div>
  );
}
