"use client";

import { Ellipsis } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Button } from "@/components/ui/button";

export interface SuggestionChipItem {
  key: string;
  /** A single element, keyed by the wrapping Fragment, so each item is one child of the row. */
  node: ReactElement;
}

/** Fades a chip in on mount unless the user prefers reduced motion. */
export const CHIP_FADE_IN =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200";

const MAX_ROWS = 2;
const SKELETON_WIDTHS = ["w-28", "w-20", "w-24"];
const STALE = { sig: "", limit: null as number | null };

/** Row index (0-based) of each element, grouping elements by their top edge. */
function rowsOf(els: Element[]): number[] {
  const tops = els.map((e) => e.getBoundingClientRect().top);
  const lines: number[] = [];
  for (const t of [...tops].sort((a, b) => a - b)) {
    if (lines.length === 0 || t - lines[lines.length - 1]! > 2) lines.push(t);
  }
  return tops.map((t) => lines.filter((l) => l <= t + 2).length - 1);
}

/**
 * Chips in the parent's flex-wrap row; past `MAX_ROWS` rows the rest hide behind
 * a dots chip. Fit is measured from layout once chips are real (not skeletons),
 * trimming until the dots chip also lands on the last allowed row.
 */
export function SuggestionChipRow({
  items,
  loading,
}: {
  items: SuggestionChipItem[];
  loading: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fit, setFit] = useState(STALE);
  const sig = items.map((i) => i.key).join("|");
  const limit = fit.sig === sig ? fit.limit : null;
  const shown = expanded || limit === null ? items : items.slice(0, limit);
  const hidden = items.length - shown.length;
  const showDots = expanded || hidden > 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (loading) {
      // Skeletons are not chips; measure afresh once the real chips render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFit(STALE);
      return;
    }
    if (!root || !parent || items.length === 0) return;
    const own = [...root.children];
    const all = [...parent.children].filter((c) => c !== root).concat(own);
    const rows = rowsOf(all);
    const rowOf = (el: Element) => rows[all.indexOf(el)]!;
    if (expanded) {
      // Everything fits without hiding, so there is nothing to collapse.
      if (rowOf(own[own.length - 1]!) < MAX_ROWS) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpanded(false);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFit(STALE);
      }
    } else if (limit === null) {
      let n = 0;
      while (n < own.length && rowOf(own[n]!) < MAX_ROWS) n++;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFit({ sig, limit: n });
    } else if (hidden > 0 && limit > 0) {
      if (rowOf(own[own.length - 1]!) >= MAX_ROWS) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFit({ sig, limit: limit - 1 });
      }
    }
  }, [items.length, expanded, limit, hidden, sig, loading]);

  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(parent.clientWidth - width) < 1) return;
      width = parent.clientWidth;
      setFit(STALE);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="contents">
      {loading
        ? SKELETON_WIDTHS.map((w) => (
            <div
              key={w}
              aria-hidden
              data-testid="suggestion-chip-skeleton"
              className={`h-11 ${w} animate-pulse rounded-xl bg-muted motion-reduce:animate-none`}
            />
          ))
        : null}
      {loading
        ? null
        : shown.map((item) => <Fragment key={item.key}>{item.node}</Fragment>)}
      {!loading && showDots ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-testid="suggestion-chips-more"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Show fewer suggestions"
              : `Show ${hidden} more suggestion${hidden === 1 ? "" : "s"}`
          }
          onClick={() => setExpanded((v) => !v)}
          className="rounded-full border-dashed"
        >
          <Ellipsis />
        </Button>
      ) : null}
    </div>
  );
}
