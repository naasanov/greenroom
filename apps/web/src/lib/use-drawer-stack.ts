"use client";

import { useEffect, useState } from "react";

/** Slightly longer than Vaul's 500ms slide so the exit finishes before unmount. */
export const DRAWER_EXIT_MS = 650;

export interface DrawerStackEntry<T> {
  /** Unique per mount, so a reopened drawer is a fresh instance stacked on top. */
  id: string;
  /** Identity of what the drawer shows. */
  key: string;
  /** Last known data; frozen once the entry is closing. */
  data: T;
  open: boolean;
}

export interface ActiveDrawer<T> {
  key: string;
  data: T;
  /** Drop the previous drawer immediately instead of sliding it down. */
  instant?: boolean;
}

interface State<T> {
  seq: number;
  entries: DrawerStackEntry<T>[];
}

function shallowEqual(a: object, b: object): boolean {
  const ak = Object.keys(a) as (keyof typeof a)[];
  const bk = Object.keys(b);
  return (
    ak.length === bk.length && ak.every((k) => Object.is(a[k], b[k as never]))
  );
}

/**
 * Keeps replaced drawers mounted until their exit animation ends. Pass the one
 * drawer that should be open (or null); render the returned entries in order,
 * each with `open={entry.open}`. A drawer that is no longer active stays in the
 * list with `open: false` and its last data, and the newest entry renders last
 * so it stacks on top while the old one slides down.
 */
export function useDrawerStack<T extends object>(
  active: ActiveDrawer<T> | null,
): DrawerStackEntry<T>[] {
  const [state, setState] = useState<State<T>>({ seq: 0, entries: [] });
  const { entries } = state;
  const top = entries.findLast((e) => e.open);

  if (active) {
    if (!top || top.key !== active.key) {
      setState((s) => {
        const seq = s.seq + 1;
        const previous = s.entries.flatMap((e) => {
          if (!e.open) return [e];
          return active.instant ? [] : [{ ...e, open: false }];
        });
        const next = {
          id: `${active.key}#${seq}`,
          key: active.key,
          data: active.data,
          open: true,
        };
        return { seq, entries: [...previous, next] };
      });
    } else if (!shallowEqual(top.data, active.data)) {
      setState((s) => ({
        ...s,
        entries: s.entries.map((e) =>
          e.id === top.id ? { ...e, data: active.data } : e,
        ),
      }));
    }
  } else if (top) {
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.open ? { ...e, open: false } : e)),
    }));
  }

  const closedIds = entries
    .filter((e) => !e.open)
    .map((e) => e.id)
    .join("|");
  useEffect(() => {
    if (!closedIds) return;
    const ids = closedIds.split("|");
    const t = setTimeout(
      () =>
        setState((s) => ({
          ...s,
          entries: s.entries.filter((e) => e.open || !ids.includes(e.id)),
        })),
      DRAWER_EXIT_MS,
    );
    return () => clearTimeout(t);
  }, [closedIds]);

  return entries;
}
