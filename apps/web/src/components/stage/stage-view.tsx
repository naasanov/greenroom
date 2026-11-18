"use client";

import { Loader2, X } from "lucide-react";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChordsReader } from "@/components/chords/chords-reader";
import { useChordSheet } from "@/lib/queries/chords";
import { useWakeLock } from "@/components/media/upload/use-wake-lock";
import { readPosition, writePosition } from "./stage-storage";
import { useStageSnapshot } from "./use-stage-snapshot";

const SWIPE_PX = 50;
const INTERACTIVE =
  'nav, [role="toolbar"], [role="dialog"], [role="alertdialog"], button, select, input, textarea, a, [contenteditable]';
const KEY_IGNORED =
  'select, input, textarea, [contenteditable], [role="dialog"], [role="alertdialog"]';

/**
 * Full-screen dark reading view: one song at a time. Swipe left for the next song, right for the previous.
 * Taps do nothing and vertical drags scroll the content (touch-pan-y; pointercancel clears the gesture).
 */
export function StageView({ gigId }: { gigId: string }) {
  const router = useRouter();
  const { snapshot, status, offlineReady, saveSheet } = useStageSnapshot(gigId);
  useWakeLock(true);

  // Keeps an edge swipe from triggering the browser's history-back gesture.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorX;
    root.style.overscrollBehaviorX = "none";
    return () => {
      root.style.overscrollBehaviorX = prev;
    };
  }, []);

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
      if (e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(KEY_IGNORED)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") advance();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") back();
      else if (e.key === "Escape") exit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, exit]);

  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const down = useRef(new Set<number>());
  // Set once a second pointer lands; stays until every pointer is up.
  const multi = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A new primary pointer starts a fresh gesture, dropping any pointer that never released.
    if (e.isPrimary) {
      down.current.clear();
      multi.current = false;
    }
    down.current.add(e.pointerId);
    if (down.current.size > 1) multi.current = true;
    const inside =
      e.target instanceof Element &&
      e.currentTarget.contains(e.target) &&
      !e.target.closest(INTERACTIVE);
    start.current =
      multi.current || !e.isPrimary || !inside
        ? null
        : { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const release = (id: number) => {
    down.current.delete(id);
    if (down.current.size === 0) multi.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    release(e.pointerId);
    const from = start.current;
    if (!from || from.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) back();
      else advance();
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    release(e.pointerId);
    if (start.current?.id === e.pointerId) start.current = null;
  };

  const song = snapshot?.songs[current];
  const next = snapshot?.songs[current + 1];
  const stored = song ? snapshot?.chords?.[song.id] : undefined;
  // Fresh data wins so a band key change sticks; the stored sheet covers offline.
  const fresh = useChordSheet(snapshot?.bandId, song?.id, !!stored).data;
  const sheet = fresh ?? stored;
  useEffect(() => {
    if (fresh) saveSheet(fresh);
  }, [fresh, saveSheet]);

  const mainRef = useRef<HTMLElement>(null);
  const songId = song?.id;
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [songId]);

  return (
    <div
      data-testid="stage-view"
      role="application"
      aria-label="Stage mode"
      className="fixed inset-0 z-50 flex touch-pan-y select-none flex-col overflow-hidden overscroll-x-none bg-black text-white"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
          <main
            ref={mainRef}
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto",
              sheet ? "justify-start pt-6" : "justify-center px-6 py-6",
            )}
          >
            <h1
              data-testid="stage-title"
              className={cn(
                "text-center text-5xl leading-tight font-bold break-words sm:text-7xl",
                sheet && "px-6",
              )}
            >
              {song.title}
            </h1>
            {song.notes ? (
              <p
                data-testid="stage-notes"
                className={cn(
                  "text-center text-2xl leading-snug whitespace-pre-wrap text-neutral-200 sm:text-4xl",
                  sheet && "px-6",
                )}
              >
                {song.notes}
              </p>
            ) : null}
            {sheet && snapshot ? (
              <ChordsReader
                key={song.id}
                bandId={snapshot.bandId}
                songId={song.id}
                title={song.title}
                artist={song.artist ?? null}
                durationSeconds={song.durationSeconds ?? null}
                sheet={sheet}
                variant="embedded"
              />
            ) : null}
          </main>
          <footer
            data-testid="stage-next"
            className="border-t border-neutral-800 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
          >
            <p className="text-sm font-semibold tracking-wide text-neutral-300 uppercase">
              {next ? "Next" : "End of setlist"}
            </p>
            {next ? (
              <p className="truncate text-2xl text-neutral-100">{next.title}</p>
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
