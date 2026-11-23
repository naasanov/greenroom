"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Loader2, MapPinPlus, Pause, Play } from "lucide-react";
import {
  defaultLoopRange,
  loopPoints,
  resolveLoopRange,
  type FileEntry,
} from "@greenroom/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  audioMarkerKeys,
  isTempMarkerId,
  useAudioMarkers,
  useCreateAudioMarker,
  useDeleteAudioMarker,
  useUpdateAudioMarker,
} from "@/lib/queries/audio-markers";
import { filesContentUrl } from "@/lib/queries/files";
import { formatTime } from "./format-time";
import { LoopPanel } from "./loop-panel";
import { MarkerList } from "./marker-list";
import { MarkerSheet } from "./marker-sheet";
import { SpeedPitch } from "./speed-pitch";
import { useAudioEngine } from "./engine/use-audio-engine";
import { usePlaybackSettings } from "./use-playback-settings";
import { Waveform } from "./waveform";

const TYPING_TARGET = "input, textarea, select, button, [role='combobox']";

function NativeFallback({ src, note }: { src: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-3 text-center">
      <p className="text-sm text-white/80">{note}</p>
      <audio
        data-testid="viewer-audio"
        src={src}
        controls
        crossOrigin="use-credentials"
        className="w-full max-w-md"
      />
    </div>
  );
}

/** In-app player: waveform, shared markers, loop range, speed and transpose. */
export function AudioPlayer({
  bandId,
  entry,
  escapeRef,
}: {
  bandId: string;
  entry: FileEntry;
  escapeRef: React.MutableRefObject<(() => boolean) | null>;
}) {
  const src = filesContentUrl(bandId, entry.id);
  const settings = usePlaybackSettings(bandId, entry.id);
  const engine = useAudioEngine(src, {
    sizeBytes: entry.sizeBytes,
    mimeType: entry.mimeType,
    rate: settings.rate,
    semitones: settings.semitones,
  });

  const markersQuery = useAudioMarkers(bandId, entry.id);
  const markers = useMemo(() => markersQuery.data ?? [], [markersQuery.data]);
  const createMarker = useCreateAudioMarker(bandId, entry.id);
  const updateMarker = useUpdateAudioMarker(bandId, entry.id);
  const deleteMarker = useDeleteAudioMarker(bandId, entry.id);
  const saving =
    useIsMutating({ mutationKey: audioMarkerKeys.update(bandId, entry.id) }) >
    0;

  const [pickedId, setSelectedId] = useState<string | null>(null);
  // A marker deleted by anyone drops out of the list, which closes its sheet.
  const selected = markers.find((m) => m.id === pickedId) ?? null;
  const selectedId = selected?.id ?? null;

  const [loopOpen, setLoopOpen] = useState(false);
  const [loopSel, setLoopSel] = useState({ startId: "", endId: "" });
  const points = useMemo(
    () => loopPoints(markers, engine.durationMs),
    [markers, engine.durationMs],
  );
  const loopRange = useMemo(
    () =>
      loopOpen
        ? resolveLoopRange(
            points,
            loopSel.startId,
            loopSel.endId,
            engine.positionMs,
          )
        : null,
    [loopOpen, points, loopSel, engine.positionMs],
  );
  const loopStartMs = loopRange?.startMs ?? null;
  const loopEndMs = loopRange?.endMs ?? null;
  const { setLoop } = engine;
  const engineStatus = engine.status;
  // Re-applied when the engine becomes ready so an early loop is not lost.
  useEffect(() => {
    if (loopStartMs === null || loopEndMs === null) setLoop(null);
    else setLoop({ startMs: loopStartMs, endMs: loopEndMs });
  }, [loopStartMs, loopEndMs, setLoop, engineStatus]);

  function setLoopOpenState(open: boolean) {
    if (open) setLoopSel(defaultLoopRange(points, engine.positionMs));
    setLoopOpen(open);
  }

  const stateRef = useRef({ selectedId, loopOpen });
  useEffect(() => {
    stateRef.current = { selectedId, loopOpen };
  });
  useEffect(() => {
    escapeRef.current = () => {
      const s = stateRef.current;
      if (s.selectedId) {
        setSelectedId(null);
        return true;
      }
      if (s.loopOpen) {
        setLoopOpen(false);
        return true;
      }
      return false;
    };
    return () => {
      escapeRef.current = null;
    };
  }, [escapeRef]);

  const { toggle } = engine;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest(TYPING_TARGET)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (engine.status === "too-large") {
    return (
      <NativeFallback
        src={src}
        note="This recording is too long for the practice player, so it plays in the basic player."
      />
    );
  }
  if (engine.status === "error") {
    return (
      <NativeFallback
        src={src}
        note={engine.error ?? "This recording could not be loaded."}
      />
    );
  }

  const ready = engine.status === "ready" && engine.peaks !== null;

  return (
    <div className="relative size-full min-h-0">
      <div
        className={cn(
          "flex size-full flex-col gap-4 overflow-y-auto overscroll-contain p-1",
          loopOpen ? "pb-40" : "pb-28",
        )}
      >
        <div className="flex items-center gap-4">
          <Button
            type="button"
            size="icon-lg"
            data-testid="player-toggle"
            aria-label={engine.playing ? "Pause" : "Play"}
            onClick={() => engine.toggle()}
            className="size-16 shrink-0 rounded-full"
          >
            {engine.playing ? (
              <Pause className="size-7" />
            ) : (
              <Play className="size-7" />
            )}
          </Button>
          <p
            data-testid="player-time"
            className="font-mono text-lg tabular-nums"
          >
            {formatTime(engine.positionMs)} /{" "}
            {formatTime(Math.round(engine.durationMs / 1000) * 1000)}
          </p>
        </div>

        {ready ? (
          <Waveform
            peaks={engine.peaks!}
            durationMs={engine.durationMs}
            positionMs={engine.positionMs}
            markers={markers}
            loop={loopRange}
            onSeek={(ms) => engine.seek(ms)}
            onMarkerTap={(id) => {
              const m = markers.find((x) => x.id === id);
              if (m) engine.seek(m.positionMs);
            }}
          />
        ) : (
          <div
            data-testid="player-loading"
            className="flex h-24 w-full animate-pulse items-center justify-center gap-2 rounded-lg bg-white/10 text-sm text-white/80"
          >
            <Loader2 className="size-4 animate-spin" />
            Loading audio...
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          disabled={!ready}
          onClick={() =>
            createMarker.mutate({
              positionMs: Math.round(engine.positionMs),
              title: `Marker ${markers.length + 1}`,
            })
          }
          className="h-11 self-start"
        >
          <MapPinPlus />
          Add marker
        </Button>

        <SpeedPitch
          rate={settings.rate}
          semitones={settings.semitones}
          onRateChange={settings.setRate}
          onSemitonesChange={settings.setSemitones}
        />

        <MarkerList
          markers={markers}
          activeId={selectedId}
          onSelect={(id) => {
            if (!isTempMarkerId(id)) setSelectedId(id);
          }}
        />
      </div>

      {ready ? (
        <LoopPanel
          open={loopOpen}
          onOpenChange={setLoopOpenState}
          points={points}
          startId={loopRange?.startId ?? ""}
          endId={loopRange?.endId ?? ""}
          onChange={setLoopSel}
        />
      ) : null}

      {selected ? (
        <MarkerSheet
          key={selected.id}
          marker={selected}
          durationMs={engine.durationMs}
          saving={saving}
          onNudge={(pos) => engine.playFrom(pos)}
          onChange={(patch) =>
            updateMarker.mutate({ markerId: selected.id, patch })
          }
          onDelete={() => {
            deleteMarker.mutate(selected.id);
            setSelectedId(null);
          }}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
