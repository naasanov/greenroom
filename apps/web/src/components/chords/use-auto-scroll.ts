"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoScrollState = "idle" | "leadin" | "playing";

interface Options {
  getScroller: () => HTMLElement | null;
  /** Current speed in pixels per second. */
  getSpeed: () => number;
  leadInMs?: number;
}

/**
 * Time-based auto-scroll with a lead-in. Manual input (wheel, touch drag,
 * scrollbar drag) pauses it; play continues from the current position.
 */
export function useAutoScroll({
  getScroller,
  getSpeed,
  leadInMs = 3000,
}: Options) {
  const [state, setState] = useState<AutoScrollState>("idle");
  const stopRef = useRef<(() => void) | null>(null);
  const optsRef = useRef({ getScroller, getSpeed });
  useEffect(() => {
    optsRef.current = { getScroller, getSpeed };
  });

  const pause = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setState("idle");
  }, []);

  const play = useCallback(() => {
    const el = optsRef.current.getScroller();
    if (!el) return;
    stopRef.current?.();
    const target: HTMLElement | Window =
      el === document.scrollingElement ? window : el;
    let raf = 0;
    let acc = 0;
    let last = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      target.removeEventListener("wheel", onManual);
      target.removeEventListener("touchmove", onManual);
    };
    const halt = () => {
      stop();
      stopRef.current = null;
      setState("idle");
    };
    const onManual = () => halt();
    target.addEventListener("wheel", onManual, { passive: true });
    target.addEventListener("touchmove", onManual, { passive: true });

    const tick = (now: number) => {
      if (stopped) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (Math.abs(el.scrollTop - acc) > 4) return halt();
      if (acc >= max - 1) return halt();
      acc = Math.min(max, acc + optsRef.current.getSpeed() * dt);
      el.scrollTop = acc;
      raf = requestAnimationFrame(tick);
    };

    const timer = window.setTimeout(() => {
      if (stopped) return;
      acc = el.scrollTop;
      setState("playing");
      raf = requestAnimationFrame(tick);
    }, leadInMs);

    stopRef.current = stop;
    setState("leadin");
  }, [leadInMs]);

  useEffect(() => () => stopRef.current?.(), []);

  return { state, play, pause, toggle: state === "idle" ? play : pause };
}
