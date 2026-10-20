"use client";

import { useEffect, useState } from "react";

/** Minimum layout-vs-visual height gap that counts as an on-screen keyboard. */
const KEYBOARD_MIN_GAP = 150;

export interface KeyboardViewport {
  open: boolean;
  /** Distance from the layout viewport bottom up to the keyboard top. */
  bottom: number;
  /** Height of the visual viewport, i.e. the space above the keyboard. */
  height: number;
}

const CLOSED: KeyboardViewport = { open: false, bottom: 0, height: 0 };

/** Tracks window.visualViewport so fixed UI can sit above the iOS keyboard. */
export function useKeyboardViewport(): KeyboardViewport {
  const [state, setState] = useState(CLOSED);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const layout = window.innerHeight;
      const next: KeyboardViewport =
        layout - vv.height > KEYBOARD_MIN_GAP
          ? {
              open: true,
              bottom: Math.max(
                0,
                Math.round(layout - vv.offsetTop - vv.height),
              ),
              height: Math.round(vv.height),
            }
          : CLOSED;
      setState((prev) =>
        prev.open === next.open &&
        prev.bottom === next.bottom &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}

const FIELD = "input, textarea, select, [contenteditable='true']";

/** Scrolls the nearest scrollable ancestor (inside root) so el is fully visible. */
export function revealInScrollParent(el: Element, root: Element, margin = 16) {
  let p = el.parentElement;
  while (p && p !== root) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) {
      const pr = p.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom - margin) {
        p.scrollTop += er.bottom - pr.bottom + margin;
      } else if (er.top < pr.top + margin) {
        p.scrollTop -= pr.top + margin - er.top;
      }
      return;
    }
    p = p.parentElement;
  }
}

/**
 * Keeps a focused field visible inside its drawer body, on focus and again
 * whenever the keyboard resizes the visual viewport. Scrolling is instant.
 */
export function useRevealFocusedField(
  root: HTMLElement | null,
  keyboard: KeyboardViewport,
) {
  const { open, height } = keyboard;

  useEffect(() => {
    if (!root) return;
    const reveal = () => {
      const el = document.activeElement;
      if (el && root.contains(el) && el.matches(FIELD)) {
        revealInScrollParent(el, root);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = () => {
      reveal();
      clearTimeout(timer);
      timer = setTimeout(reveal, 350);
    };
    root.addEventListener("focusin", onFocusIn);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      clearTimeout(timer);
    };
  }, [root]);

  useEffect(() => {
    if (!open) return;
    const el = document.activeElement;
    if (root && el && root.contains(el) && el.matches(FIELD)) {
      requestAnimationFrame(() => revealInScrollParent(el, root));
    }
  }, [open, height, root]);
}
