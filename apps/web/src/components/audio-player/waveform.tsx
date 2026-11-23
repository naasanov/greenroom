"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { formatTime } from "@/components/audio-player/format-time";

interface WaveformMarker {
  id: string;
  title: string;
  positionMs: number;
}

const HEIGHT = 96;
const FLAG_ROWS = 3;
const FLAG_ROW_HEIGHT = 24;
const FLAG_MAX_WIDTH = 96;
const FLAG_MIN_WIDTH = 32;
const BAR_STEP = 3;
const SEEK_STEP_MS = 5000;

/** Greedy row packing so neighbouring flags stay tappable; the last row shrinks them. */
function layoutFlags(
  markers: readonly WaveformMarker[],
  durationMs: number,
  width: number,
) {
  const sorted = [...markers].sort(
    (a, b) => a.positionMs - b.positionMs || (a.id < b.id ? -1 : 1),
  );
  const rowEnds = Array<number>(FLAG_ROWS).fill(-Infinity);
  return sorted.map((m) => {
    const x =
      durationMs > 0
        ? Math.min(width, Math.max(0, (m.positionMs / durationMs) * width))
        : 0;
    const wanted = Math.min(FLAG_MAX_WIDTH, 22 + m.title.length * 6.5);
    let row = rowEnds.findIndex((end) => end + 2 <= x);
    let w = wanted;
    if (row === -1) {
      row = rowEnds.indexOf(Math.min(...rowEnds));
      w = Math.max(FLAG_MIN_WIDTH, Math.min(wanted, x - rowEnds[row]! - 2));
    }
    // Flags near the right edge hang to the left of their marker.
    const alignRight = x + w > width;
    const left = alignRight ? x - w : x;
    rowEnds[row] = alignRight ? x : x + w;
    return { marker: m, row, left, width: w, alignRight };
  });
}

export function Waveform(props: {
  peaks: Float32Array;
  durationMs: number;
  positionMs: number;
  markers: readonly WaveformMarker[];
  loop: { startMs: number; endMs: number } | null;
  onSeek(ms: number): void;
  onMarkerTap(id: string): void;
}) {
  const { peaks, durationMs, positionMs, markers, loop } = props;
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frac = (ms: number) =>
    durationMs > 0 ? Math.min(1, Math.max(0, ms / durationMs)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    if (loop) {
      const x0 = frac(loop.startMs) * width;
      const x1 = frac(loop.endMs) * width;
      ctx.fillStyle = "rgba(96, 165, 250, 0.3)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), HEIGHT);
    }

    const playedX = frac(positionMs) * width;
    const bars = Math.max(1, Math.floor(width / BAR_STEP));
    const mid = HEIGHT / 2;
    for (let i = 0; i < bars; i++) {
      const x = i * BAR_STEP;
      let peak = 0;
      if (peaks.length > 0) {
        const from = Math.floor((i / bars) * peaks.length);
        const to = Math.max(
          from + 1,
          Math.floor(((i + 1) / bars) * peaks.length),
        );
        for (let j = from; j < to && j < peaks.length; j++) {
          peak = Math.max(peak, peaks[j]!);
        }
      }
      const h = Math.max(2, Math.min(1, peak) * (HEIGHT - 8));
      ctx.fillStyle =
        x + 1 <= playedX ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(x, mid - h / 2, BAR_STEP - 1, h);
    }

    ctx.fillStyle = "rgba(251, 191, 36, 0.8)";
    for (const m of markers) {
      ctx.fillRect(Math.round(frac(m.positionMs) * width), 0, 1, HEIGHT);
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(Math.min(width - 2, Math.max(0, playedX - 1)), 0, 2, HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, width, positionMs, durationMs, markers, loop]);

  const flags = useMemo(
    () => layoutFlags(markers, durationMs, width),
    [markers, durationMs, width],
  );
  const usedRows = flags.reduce((n, f) => Math.max(n, f.row + 1), 0);

  function seekFromPointer(clientX: number) {
    const el = areaRef.current;
    if (!el || durationMs <= 0) return;
    const rect = el.getBoundingClientRect();
    const f = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    props.onSeek(Math.round(Math.min(1, Math.max(0, f)) * durationMs));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? SEEK_STEP_MS : -SEEK_STEP_MS;
    props.onSeek(Math.min(durationMs, Math.max(0, positionMs + delta)));
  }

  return (
    <div className="w-full text-white">
      <div
        className="relative"
        style={{ height: usedRows * FLAG_ROW_HEIGHT }}
        data-testid="waveform-flags"
      >
        {flags.map(({ marker, row, left, width: w, alignRight }) => (
          <button
            key={marker.id}
            type="button"
            data-testid="waveform-marker"
            aria-label={`Marker ${marker.title} at ${formatTime(marker.positionMs, true)}`}
            onClick={() => props.onMarkerTap(marker.id)}
            style={{ left, width: w, top: row * FLAG_ROW_HEIGHT }}
            className={cn(
              "absolute flex h-[22px] items-center rounded-sm bg-amber-400 px-1.5 text-xs font-medium text-black focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
              alignRight ? "justify-end rounded-br-none" : "rounded-bl-none",
            )}
          >
            <span className="truncate">{marker.title}</span>
          </button>
        ))}
      </div>
      <div
        ref={areaRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(positionMs / 1000)}
        aria-valuetext={formatTime(positionMs)}
        data-testid="waveform"
        onClick={(e) => seekFromPointer(e.clientX)}
        onKeyDown={onKeyDown}
        className="relative w-full cursor-pointer touch-pan-y rounded-sm focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
        style={{ height: HEIGHT }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none block"
          style={{ width: "100%", height: HEIGHT }}
        />
      </div>
    </div>
  );
}
