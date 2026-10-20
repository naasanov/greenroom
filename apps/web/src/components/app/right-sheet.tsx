"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Detail sheet that comes in from the right. Full-screen on mobile; on desktop
 * a non-modal panel, so other items stay clickable while it is open.
 */
export function RightSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  onPrevious,
  onNext,
  canPrevious = true,
  canNext = true,
  editable,
  editing = false,
  onEditingChange,
  headerSlot,
  placement = "fixed",
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** Provide either to show the up/down navigation arrows. */
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  /** Shows the Edit button top-right. */
  editable?: boolean;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Replaces the Edit button area entirely (e.g. a Save button). */
  headerSlot?: ReactNode;
  placement?: "fixed" | "contained";
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const hasNav = onPrevious || onNext;

  return (
    <aside
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      data-state={open ? "open" : "closed"}
      data-testid="right-sheet"
      className={cn(
        placement === "fixed" ? "fixed" : "absolute",
        "inset-y-0 right-0 z-40 flex w-full flex-col bg-card shadow-lift transition-[translate,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:w-[26rem] md:rounded-l-3xl md:border-l",
        open ? "visible translate-x-0" : "invisible translate-x-full",
        className,
      )}
    >
      <header className="pt-safe flex shrink-0 items-center gap-1 border-b px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        >
          <X />
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-base leading-tight font-semibold">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {hasNav ? (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous"
              disabled={!canPrevious || !onPrevious}
              onClick={onPrevious}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next"
              disabled={!canNext || !onNext}
              onClick={onNext}
            >
              <ChevronDown />
            </Button>
          </div>
        ) : null}
        {headerSlot ??
          (editable ? (
            <Button
              variant={editing ? "secondary" : "ghost"}
              onClick={() => onEditingChange?.(!editing)}
              className="w-[5.5rem] shrink-0"
            >
              {editing ? "Cancel" : "Edit"}
            </Button>
          ) : null)}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {children}
      </div>
      {footer ? (
        <div className="pb-safe border-t px-5 pt-3 pb-3">{footer}</div>
      ) : (
        <div className="pb-safe" />
      )}
    </aside>
  );
}
