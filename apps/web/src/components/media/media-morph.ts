/**
 * Grow/morph between the drawer media strip and the full-screen gallery.
 * An overlay snapshot of the strip grows while the gallery is revealed with an
 * animated clip-path. Every step is optional: failures leave plain navigation.
 */

const MS = 340;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const OVERLAY_TTL = 2000;

interface Origin {
  gigId: string;
  rect: DOMRect;
  html: string;
}

let origin: Origin | null = null;
let pending: { overlay: HTMLElement; timer: number } | null = null;

const canAnimate = () =>
  typeof document !== "undefined" &&
  typeof HTMLElement.prototype.animate === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeOverlay(o: Origin): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-testid", "media-morph");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = o.html;
  el.querySelectorAll("[data-testid],[id]").forEach((n) => {
    n.removeAttribute("data-testid");
    n.removeAttribute("id");
  });
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "100",
    pointerEvents: "none",
    overflow: "hidden",
    background: "var(--background)",
    borderRadius: "24px",
    top: `${o.rect.top}px`,
    left: `${o.rect.left}px`,
    width: `${o.rect.width}px`,
    height: `${o.rect.height}px`,
  });
  document.body.appendChild(el);
  return el;
}

function dropPending() {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pending.overlay.remove();
  pending = null;
}

const insetFor = (r: DOMRect) =>
  `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px round 24px)`;

/** Call before navigating to the gallery; snapshots the strip. Returns without effect when motion is off. */
export function beginMorph(gigId: string, strip: HTMLElement | null) {
  dropPending();
  origin = null;
  try {
    if (!strip || !canAnimate()) return;
    const rect = strip.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    origin = { gigId, rect, html: strip.innerHTML };
    const overlay = makeOverlay(origin);
    pending = {
      overlay,
      timer: window.setTimeout(dropPending, OVERLAY_TTL),
    };
  } catch {
    dropPending();
    origin = null;
  }
}

/** Plays the grow once the gallery is mounted; a direct load has no pending overlay and does nothing. */
export function playOpen(gigId: string, frame: HTMLElement | null) {
  const p = pending;
  if (!p || !origin || origin.gigId !== gigId) return dropPending();
  pending = null;
  window.clearTimeout(p.timer);
  const gallery = frame?.querySelector<HTMLElement>(
    '[data-testid="media-gallery"]',
  );
  try {
    if (!gallery || !canAnimate()) throw new Error("skip");
    const from = origin.rect;
    const opts = { duration: MS, easing: EASE };
    const box = p.overlay.animate(
      [
        {
          top: `${from.top}px`,
          left: `${from.left}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
          borderRadius: "24px",
          opacity: 1,
        },
        {
          top: "0px",
          left: "0px",
          width: `${window.innerWidth}px`,
          height: `${window.innerHeight}px`,
          borderRadius: "0px",
          opacity: 1,
          offset: 0.7,
        },
        {
          top: "0px",
          left: "0px",
          width: `${window.innerWidth}px`,
          height: `${window.innerHeight}px`,
          borderRadius: "0px",
          opacity: 0,
        },
      ],
      { ...opts, fill: "forwards" },
    );
    const reveal = gallery.animate(
      [{ clipPath: insetFor(from) }, { clipPath: "inset(0px round 0px)" }],
      opts,
    );
    const done = () => p.overlay.remove();
    box.finished.then(done, done);
    reveal.finished.catch(() => {});
  } catch {
    p.overlay.remove();
  }
}

/**
 * Collapses the gallery back to the strip's rect, then runs `navigate`.
 * Returns false (caller navigates immediately) when no matching origin exists.
 */
export function playClose(
  gigId: string,
  frame: HTMLElement | null,
  navigate: () => void,
): boolean {
  const o = origin;
  const gallery = frame?.querySelector<HTMLElement>(
    '[data-testid="media-gallery"]',
  );
  origin = null;
  if (!o || o.gigId !== gigId || !gallery || !canAnimate()) return false;
  try {
    dropPending();
    const overlay = makeOverlay(o);
    overlay.style.opacity = "0";
    const opts = { duration: MS, easing: EASE };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      navigate();
      // Hold the strip snapshot while the drawer remounts underneath.
      overlay
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 160,
          delay: 140,
          fill: "forwards",
        })
        .finished.then(
          () => overlay.remove(),
          () => overlay.remove(),
        );
    };
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
      ...opts,
      fill: "forwards",
    });
    const shrink = gallery.animate(
      [{ clipPath: "inset(0px round 0px)" }, { clipPath: insetFor(o.rect) }],
      { ...opts, fill: "forwards" },
    );
    shrink.finished.then(finish, finish);
    window.setTimeout(finish, MS + 400);
    return true;
  } catch {
    navigate();
    return true;
  }
}
