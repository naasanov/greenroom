"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Placement, ShellLayout } from "@/components/app/event-types";

export interface FabAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

const OFFSET: Record<ShellLayout, string> = {
  // Clears the 4rem tab bar plus the home indicator inset.
  responsive:
    "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)] md:bottom-6",
  mobile: "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)]",
  desktop: "bottom-6",
};

/**
 * Floating + button, bottom-right above the tab bar. With `actions` it opens a
 * speed dial of labeled buttons; without, it calls `onClick`.
 */
export function Fab({
  onClick,
  label = "Add",
  actions,
  layout = "responsive",
  placement = "fixed",
  className,
}: {
  onClick?: () => void;
  label?: string;
  actions?: FabAction[];
  layout?: ShellLayout;
  placement?: Placement;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dial = !!actions?.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {dial ? (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={cn(
            placement === "fixed" ? "fixed" : "absolute",
            "inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      ) : null}
      <div
        data-testid="fab"
        data-open={open}
        className={cn(
          placement === "fixed" ? "fixed" : "absolute",
          "pr-safe right-4 z-30 flex flex-col items-end gap-3",
          OFFSET[layout],
          className,
        )}
      >
        {dial ? (
          <ul
            className={cn(
              "flex flex-col items-end gap-3",
              !open && "pointer-events-none invisible delay-200",
            )}
          >
            {actions.map((a, i) => (
              <li
                key={a.key}
                className={cn(
                  "transition-all duration-200 ease-out",
                  open
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-3 scale-90 opacity-0",
                )}
                style={{
                  transitionDelay: open
                    ? `${(actions.length - 1 - i) * 40}ms`
                    : "0ms",
                }}
              >
                <button
                  type="button"
                  tabIndex={open ? 0 : -1}
                  data-testid={`fab-action-${a.key}`}
                  onClick={() => {
                    setOpen(false);
                    a.onSelect();
                  }}
                  className="flex h-12 items-center gap-3 rounded-full bg-card py-1 pr-5 pl-2 text-sm font-medium shadow-lift ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-gig-soft text-gig-soft-foreground [&_svg]:size-5">
                    {a.icon}
                  </span>
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          aria-label={label}
          aria-expanded={dial ? open : undefined}
          onClick={() => (dial ? setOpen((o) => !o) : onClick?.())}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
        >
          <Plus
            className={cn(
              "size-7 transition-transform duration-200",
              open && "rotate-45",
            )}
            strokeWidth={2.5}
          />
        </button>
      </div>
    </>
  );
}
