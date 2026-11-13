"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "band", label: "Band" },
  { key: "connections", label: "Connections" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

/** Reads the active tab from `?tab=`, falling back to Profile. */
export function useSettingsTab(): [SettingsTab, (t: SettingsTab) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab = SETTINGS_TABS.find((t) => t.key === raw)?.key ?? "profile";
  const setTab = (next: SettingsTab) => {
    const qs = new URLSearchParams(params);
    qs.set("tab", next);
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };
  return [tab, setTab];
}

/** Sticky segmented control with tab roles and arrow-key navigation. */
export function SettingsTabBar({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (t: SettingsTab) => void;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = SETTINGS_TABS.findIndex((t) => t.key === active);
    const next =
      SETTINGS_TABS[(i + step + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
    onChange(next.key);
    document.getElementById(`settings-tab-${next.key}`)?.focus();
  };

  return (
    <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
      <div
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1"
      >
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`settings-tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`settings-panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "min-h-10 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === t.key
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tab panel; only the active panel renders its children. */
export function SettingsPanel({
  tab,
  active,
  children,
}: {
  tab: SettingsTab;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`settings-panel-${tab}`}
      aria-labelledby={`settings-tab-${tab}`}
      hidden={!active}
      className="flex flex-col gap-6"
    >
      {active ? children : null}
    </div>
  );
}
