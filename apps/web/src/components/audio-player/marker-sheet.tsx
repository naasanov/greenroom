"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  AUDIO_MARKER_TITLE_MAX,
  type AudioMarker,
  type UpdateAudioMarker,
} from "@greenroom/shared";
import { formatTime } from "./format-time";
import { parseTime } from "./parse-time";

export { parseTime };

const PERSIST_DEBOUNCE_MS = 400;

const NUDGES = [
  { label: "-1 s", aria: "Nudge back 1 second", delta: -1000 },
  { label: "-0.1 s", aria: "Nudge back 0.1 seconds", delta: -100 },
  { label: "+0.1 s", aria: "Nudge forward 0.1 seconds", delta: 100 },
  { label: "+1 s", aria: "Nudge forward 1 second", delta: 1000 },
] as const;

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-white/10 px-3 text-sm font-medium text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50";
const field =
  "h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-base text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/60";

/** Bottom panel for editing one marker; sits inside the viewer, not a portal. */
export function MarkerSheet({
  marker,
  durationMs,
  onNudge,
  onChange,
  onDelete,
  onClose,
  saving,
}: {
  marker: AudioMarker;
  durationMs: number;
  onNudge(positionMs: number): void;
  onChange(patch: UpdateAudioMarker): void;
  onDelete(): void;
  onClose(): void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(marker.title);
  const [timeText, setTimeText] = useState(formatTime(marker.positionMs, true));
  const [timeError, setTimeError] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // The position the user has steered to; the server value only seeds it.
  const posRef = useRef(marker.positionMs);
  const dirtyPos = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFocused = useRef(false);
  const timeFocused = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Follow bandmates' edits to this marker unless the user is mid-edit.
  useEffect(() => {
    if (!titleFocused.current) setTitle(marker.title);
  }, [marker.title]);
  useEffect(() => {
    if (dirtyPos.current) return;
    posRef.current = marker.positionMs;
    if (!timeFocused.current) {
      setTimeText(formatTime(marker.positionMs, true));
      setTimeError(false);
    }
  }, [marker.positionMs]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dirtyPos.current) {
      dirtyPos.current = false;
      onChangeRef.current({ positionMs: posRef.current });
    }
  };
  // Pending debounced position persists when the sheet closes or switches marker.
  useEffect(() => flush, []);

  const schedulePersist = () => {
    dirtyPos.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  };

  const setPosition = (ms: number) => {
    posRef.current = ms;
    setTimeText(formatTime(ms, true));
    setTimeError(false);
  };

  const nudge = (delta: number) => {
    const next = Math.min(
      durationMs,
      Math.max(0, Math.round((posRef.current + delta) / 100) * 100),
    );
    setPosition(next);
    onNudge(next);
    schedulePersist();
  };

  const commitTitle = () => {
    titleFocused.current = false;
    const t = title.trim();
    if (!t) {
      setTitle(marker.title);
      return;
    }
    setTitle(t);
    if (t !== marker.title) onChange({ title: t });
  };

  const commitTime = () => {
    timeFocused.current = false;
    const ms = parseTime(timeText);
    if (ms === null || ms < 0 || ms > durationMs) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    if (ms === posRef.current && !dirtyPos.current) {
      setTimeText(formatTime(ms, true));
      return;
    }
    setPosition(ms);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dirtyPos.current = false;
    onChange({ positionMs: ms });
  };

  const enterKey = (e: React.KeyboardEvent, commit: () => void) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
  };

  return (
    <div
      role="dialog"
      aria-label="Edit marker"
      data-testid="marker-sheet"
      className="absolute inset-x-0 bottom-0 z-20 flex animate-in flex-col gap-3 rounded-t-2xl border-t border-white/15 bg-neutral-900 p-4 pb-safe text-white shadow-2xl duration-200 slide-in-from-bottom"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Edit marker</h2>
        <button
          type="button"
          aria-label="Close marker"
          onClick={onClose}
          className="inline-flex size-11 items-center justify-center rounded-lg text-white/80 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="flex flex-col gap-1 text-xs text-white/70">
          Marker title
          <input
            className={field}
            value={title}
            maxLength={AUDIO_MARKER_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => (titleFocused.current = true)}
            onBlur={commitTitle}
            onKeyDown={(e) => enterKey(e, commitTitle)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/70">
          Marker time
          <input
            className={field}
            inputMode="decimal"
            value={timeText}
            aria-invalid={timeError}
            onChange={(e) => {
              setTimeText(e.target.value);
              setTimeError(false);
            }}
            onFocus={() => (timeFocused.current = true)}
            onBlur={commitTime}
            onKeyDown={(e) => enterKey(e, commitTime)}
          />
        </label>
      </div>
      {timeError && (
        <p role="alert" className="-mt-1 text-xs text-red-300">
          Enter a time between 0:00 and {formatTime(durationMs, true)}.
        </p>
      )}

      <div className="grid grid-cols-4 gap-2">
        {NUDGES.map((n) => (
          <button
            key={n.label}
            type="button"
            aria-label={n.aria}
            className={btn}
            onClick={() => nudge(n.delta)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/60" aria-live="polite">
          {saving ? "Saving..." : ""}
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Delete this marker?</span>
            <button
              type="button"
              className={btn}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="marker-delete-confirm"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-3 text-sm font-medium text-white outline-none hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-white/60"
              onClick={onDelete}
            >
              Confirm delete
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-red-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={() => setConfirming(true)}
          >
            Delete marker
          </button>
        )}
      </div>
    </div>
  );
}
