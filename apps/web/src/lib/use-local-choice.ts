"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Builds a hook for a small enum setting persisted per device in localStorage.
 * Blocked storage falls back to the page-load value, and all users of the hook
 * stay in sync.
 */
export function createLocalChoice<T extends string>(
  storageKey: string,
  values: readonly T[],
  fallback: T,
): () => [T, (value: T) => void] {
  const listeners = new Set<() => void>();

  function read(): T {
    try {
      const stored = localStorage.getItem(storageKey);
      return values.find((v) => v === stored) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function write(value: T) {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Storage can be blocked; the choice then lasts for this page load only.
    }
    listeners.forEach((l) => l());
  }

  return function useLocalChoice() {
    const [session, setSession] = useState<T | null>(null);
    const stored = useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
      read,
      () => fallback,
    );
    const set = useCallback((value: T) => {
      setSession(value);
      write(value);
    }, []);
    return [session ?? stored, set];
  };
}
