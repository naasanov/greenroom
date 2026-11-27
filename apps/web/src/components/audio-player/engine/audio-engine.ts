import type { StretchNode } from "signalsmith-stretch";
import { exceedsDecodeBudget } from "./decode-budget";
import { computePeaks } from "./peaks";

export type AudioEngineStatus = "loading" | "ready" | "too-large" | "error";

export interface EngineSnapshot {
  status: AudioEngineStatus;
  error: string | null;
  durationMs: number;
  peaks: Float32Array | null;
  playing: boolean;
}

export interface EngineOptions {
  src: string;
  sizeBytes: number | null;
  mimeType: string | null;
  rate: number;
  semitones: number;
  onState: (snapshot: EngineSnapshot) => void;
  onPosition: (ms: number) => void;
}

const UPDATE_INTERVAL_S = 0.05;
// Position callbacks arriving right after a schedule can carry the old position.
const STALE_WINDOW_S = 0.15;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// Loaded from public/ at runtime so the bundler never rewrites the worklet source.
// The version query busts browser caches whenever the vendored copy is patched.
const STRETCH_URL = "/audio/signalsmith-stretch.mjs?v=2";

async function loadStretch() {
  const mod = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ STRETCH_URL
  )) as typeof import("signalsmith-stretch");
  return mod.default;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** Framework-free engine: fetch, decode, feed Signalsmith Stretch, track the playhead. */
export class AudioEngine {
  private snapshot: EngineSnapshot = {
    status: "loading",
    error: null,
    durationMs: 0,
    peaks: null,
    playing: false,
  };
  private ctx: AudioContext | null = null;
  private node: StretchNode | null = null;
  private abort = new AbortController();
  private disposed = false;
  private durationS = 0;
  private rate: number;
  private semitones: number;
  private loop: { start: number; end: number } | null = null;
  private wantPlay = false;
  // Playhead model: position at anchor.ctxTime was anchor.input (seconds).
  private anchor = { input: 0, ctxTime: 0 };
  private pausedAt = 0;
  private lastScheduleCtxTime = 0;
  private raf = 0;

  constructor(private readonly opts: EngineOptions) {
    this.rate = clamp(opts.rate, 0.5, 2);
    this.semitones = Math.round(clamp(opts.semitones, -6, 6));
    // Reset consumers (the hook is reused across src changes) before loading.
    opts.onState(this.snapshot);
    opts.onPosition(0);
    void this.load();
  }

  private emit(patch: Partial<EngineSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.opts.onState(this.snapshot);
  }

  private fail(error: string) {
    this.emit({ status: "error", error, playing: false });
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) {
      try {
        nav.audioSession.type = "playback";
      } catch {
        // Unsupported value; playback still works with the default session.
      }
    }
    this.ctx = new Ctor();
    return this.ctx;
  }

  private async load() {
    const { sizeBytes, mimeType, src } = this.opts;
    if (exceedsDecodeBudget(sizeBytes, mimeType)) {
      this.emit({ status: "too-large" });
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx)
      return this.fail("Audio playback is not supported in this browser.");

    let data: ArrayBuffer;
    try {
      const res = await fetch(src, {
        credentials: "include",
        signal: this.abort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (sizeBytes === null) {
        const len = Number(res.headers.get("content-length"));
        const mime = mimeType ?? res.headers.get("content-type");
        if (len > 0 && exceedsDecodeBudget(len, mime)) {
          this.abort.abort();
          this.emit({ status: "too-large" });
          return;
        }
      }
      data = await res.arrayBuffer();
      if (exceedsDecodeBudget(data.byteLength, mimeType)) {
        this.emit({ status: "too-large" });
        return;
      }
    } catch {
      if (!this.disposed) this.fail("Could not load this audio file.");
      return;
    }
    if (this.disposed) return;

    let buffer: AudioBuffer | null;
    try {
      buffer = await ctx.decodeAudioData(data);
    } catch {
      if (!this.disposed) this.fail("This audio format can't be played here.");
      return;
    }
    if (this.disposed) return;

    try {
      const channels = Math.min(buffer.numberOfChannels, 2);
      const peaks = computePeaks(
        Array.from({ length: buffer.numberOfChannels }, (_, i) =>
          buffer!.getChannelData(i),
        ),
      );
      const SignalsmithStretch = await loadStretch();
      const node = await SignalsmithStretch(ctx, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [channels],
      });
      if (this.disposed) {
        node.disconnect();
        return;
      }
      node.connect(ctx.destination);
      this.node = node;
      this.durationS = buffer.duration;

      // One buffer: the worklet mis-indexes a read window that straddles two buffers.
      const chunk = Math.max(1, Math.floor(buffer.sampleRate * 5));
      for (let start = 0; start < buffer.length; start += chunk) {
        const len = Math.min(chunk, buffer.length - start);
        const arrays: Float32Array[] = [];
        for (let ch = 0; ch < channels; ch++) {
          const arr = new Float32Array(len);
          buffer.copyFromChannel(arr, ch, start);
          arrays.push(arr);
        }
        await node.addBuffers(
          arrays,
          arrays.map((a) => a.buffer),
        );
        if (this.disposed) return;
      }
      buffer = null;

      node.setUpdateInterval(UPDATE_INTERVAL_S, (t) => this.onNodeTime(t));
      this.emit({ status: "ready", durationMs: this.durationS * 1000, peaks });
      this.opts.onPosition(0);
      if (this.wantPlay) this.startPlayback();
    } catch {
      if (!this.disposed) this.fail("Could not prepare this audio file.");
    }
  }

  private onNodeTime(t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.snapshot.playing) return;
    if (ctx.currentTime - this.lastScheduleCtxTime < STALE_WINDOW_S) return;
    this.anchor = { input: t, ctxTime: ctx.currentTime };
  }

  private currentSeconds(): number {
    const ctx = this.ctx;
    if (!ctx || !this.snapshot.playing) return this.pausedAt;
    let pos =
      this.anchor.input + (ctx.currentTime - this.anchor.ctxTime) * this.rate;
    const loop = this.loop;
    if (loop && pos >= loop.end && this.anchor.input < loop.end) {
      pos = loop.start + ((pos - loop.start) % (loop.end - loop.start));
    }
    return clamp(pos, 0, this.durationS);
  }

  private schedule(active: boolean, inputS: number) {
    const ctx = this.ctx;
    if (!this.node || !ctx) return;
    this.anchor = { input: inputS, ctxTime: ctx.currentTime };
    this.lastScheduleCtxTime = ctx.currentTime;
    this.node.schedule({
      active,
      input: inputS,
      rate: this.rate,
      semitones: this.semitones,
      loopStart: this.loop?.start ?? 0,
      loopEnd: this.loop?.end ?? 0,
    });
  }

  private startPlayback() {
    if (!this.node || this.snapshot.playing) return;
    const looping = this.loop !== null;
    if (!looping && this.pausedAt >= this.durationS - 0.01) this.pausedAt = 0;
    this.emit({ playing: true });
    this.schedule(true, this.pausedAt);
    this.startFrames();
  }

  private startFrames() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.disposed || !this.snapshot.playing) return;
      const pos = this.currentSeconds();
      if (!this.loop && pos >= this.durationS - 0.005) {
        this.finish();
        return;
      }
      this.opts.onPosition(pos * 1000);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.node?.schedule({ active: false });
    this.pausedAt = this.durationS;
    this.emit({ playing: false });
    this.opts.onPosition(this.durationS * 1000);
  }

  // Public controls. play/playFrom/toggle resume the context synchronously for iOS.

  play() {
    void this.ctx?.resume();
    this.wantPlay = true;
    if (this.snapshot.status === "ready") this.startPlayback();
  }

  pause() {
    this.wantPlay = false;
    if (!this.snapshot.playing) return;
    this.pausedAt = this.currentSeconds();
    cancelAnimationFrame(this.raf);
    this.node?.schedule({ active: false });
    this.emit({ playing: false });
    this.opts.onPosition(this.pausedAt * 1000);
  }

  toggle() {
    if (
      this.snapshot.playing ||
      (this.wantPlay && this.snapshot.status === "loading")
    )
      this.pause();
    else this.play();
  }

  // With a loop active, targets outside it snap to the loop start.
  private clampToLoop(s: number): number {
    const loop = this.loop;
    return loop && (s < loop.start || s >= loop.end) ? loop.start : s;
  }

  seek(ms: number) {
    if (this.snapshot.status !== "ready") return;
    const s = this.clampToLoop(clamp(ms / 1000, 0, this.durationS));
    this.pausedAt = s;
    if (this.snapshot.playing) this.schedule(true, s);
    this.opts.onPosition(s * 1000);
  }

  playFrom(ms: number) {
    void this.ctx?.resume();
    this.wantPlay = true;
    if (this.snapshot.status !== "ready") return;
    if (this.snapshot.playing) this.seek(ms);
    else {
      this.pausedAt = this.clampToLoop(clamp(ms / 1000, 0, this.durationS));
      this.startPlayback();
    }
  }

  setLoop(range: { startMs: number; endMs: number } | null) {
    if (!range || range.endMs <= range.startMs) {
      this.loop = null;
    } else {
      this.loop = { start: range.startMs / 1000, end: range.endMs / 1000 };
    }
    if (this.snapshot.status !== "ready") return;
    const pos = this.currentSeconds();
    const outside =
      this.loop && (pos < this.loop.start || pos >= this.loop.end);
    const target = outside ? this.loop!.start : pos;
    this.pausedAt = target;
    if (this.snapshot.playing) this.schedule(true, target);
    this.opts.onPosition(target * 1000);
  }

  setRate(rate: number) {
    this.applyTuning(clamp(rate, 0.5, 2), this.semitones);
  }

  setSemitones(n: number) {
    this.applyTuning(this.rate, Math.round(clamp(n, -6, 6)));
  }

  private applyTuning(rate: number, semitones: number) {
    if (rate === this.rate && semitones === this.semitones) return;
    const pos = this.currentSeconds();
    this.rate = rate;
    this.semitones = semitones;
    if (this.snapshot.playing) this.schedule(true, pos);
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    cancelAnimationFrame(this.raf);
    try {
      this.node?.stop();
      this.node?.disconnect();
    } catch {
      // Node may already be torn down.
    }
    this.node = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
