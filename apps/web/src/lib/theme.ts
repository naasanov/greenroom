"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "greenroom-theme";

/** Inline script run before paint so the first frame matches the theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage unavailable, fall through to system
  }
  return "system";
}

function applyPreference(pref: ThemePreference) {
  const dark =
    pref === "dark" ||
    (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    applyPreference(readPreference());
    cb();
  };
  media.addEventListener("change", onMedia);
  return () => {
    listeners.delete(cb);
    media.removeEventListener("change", onMedia);
  };
}

/** Theme preference with a system default and a light/dark override. */
export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    readPreference,
    () => "system",
  );
  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // override still applies for this page view
    }
    applyPreference(next);
    listeners.forEach((l) => l());
  }, []);
  return { preference, setPreference };
}
