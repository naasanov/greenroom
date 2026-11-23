"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioEngine as Engine,
  type AudioEngineStatus,
  type EngineSnapshot,
} from "./audio-engine";

export { PEAK_BUCKETS } from "./peaks";
export type { AudioEngineStatus };

export interface AudioEngine {
  status: AudioEngineStatus;
  error: string | null;
  durationMs: number;
  peaks: Float32Array | null;
  playing: boolean;
  positionMs: number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  playFrom(ms: number): void;
  setLoop(range: { startMs: number; endMs: number } | null): void;
  setRate(rate: number): void;
  setSemitones(n: number): void;
}

interface Opts {
  sizeBytes: number | null;
  mimeType: string | null;
  rate: number;
  semitones: number;
}

const INITIAL: EngineSnapshot = {
  status: "loading",
  error: null,
  durationMs: 0,
  peaks: null,
  playing: false,
};

export function useAudioEngine(src: string, opts: Opts): AudioEngine {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(INITIAL);
  const [positionMs, setPositionMs] = useState(0);
  const engineRef = useRef<Engine | null>(null);
  const tuningRef = useRef({ rate: opts.rate, semitones: opts.semitones });

  const sourceRef = useRef({
    sizeBytes: opts.sizeBytes,
    mimeType: opts.mimeType,
  });
  useEffect(() => {
    tuningRef.current = { rate: opts.rate, semitones: opts.semitones };
    sourceRef.current = { sizeBytes: opts.sizeBytes, mimeType: opts.mimeType };
  }, [opts.rate, opts.semitones, opts.sizeBytes, opts.mimeType]);
  useEffect(() => {
    const engine = new Engine({
      src,
      sizeBytes: sourceRef.current.sizeBytes,
      mimeType: sourceRef.current.mimeType,
      rate: tuningRef.current.rate,
      semitones: tuningRef.current.semitones,
      onState: setSnapshot,
      onPosition: setPositionMs,
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    engineRef.current?.setRate(opts.rate);
  }, [opts.rate]);
  useEffect(() => {
    engineRef.current?.setSemitones(opts.semitones);
  }, [opts.semitones]);

  const controls = useMemo(
    () => ({
      play: () => engineRef.current?.play(),
      pause: () => engineRef.current?.pause(),
      toggle: () => engineRef.current?.toggle(),
      seek: (ms: number) => engineRef.current?.seek(ms),
      playFrom: (ms: number) => engineRef.current?.playFrom(ms),
      setLoop: (r: { startMs: number; endMs: number } | null) =>
        engineRef.current?.setLoop(r),
      setRate: (r: number) => engineRef.current?.setRate(r),
      setSemitones: (n: number) => engineRef.current?.setSemitones(n),
    }),
    [],
  );

  return {
    ...snapshot,
    positionMs: Math.min(Math.max(positionMs, 0), snapshot.durationMs),
    ...controls,
  };
}
