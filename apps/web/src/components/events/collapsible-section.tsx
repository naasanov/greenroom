"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A drawer section whose heading is a chevron toggle. The body animates its
 * height and is hidden and inert while collapsed; it stays mounted so local
 * state survives. Header `actions` sit beside the toggle and never trigger it.
 */
export function CollapsibleSection({
  title,
  headingId,
  label,
  meta,
  actions,
  headingClassName = "text-base font-semibold",
  className,
  testId,
  children,
}: {
  title: ReactNode;
  /** Id of the heading, which names the section unless `label` is given. */
  headingId?: string;
  /** Accessible name for the section when it differs from the heading. */
  label?: string;
  /** Quiet text beside the heading (counts, totals). */
  meta?: ReactNode;
  actions?: ReactNode;
  headingClassName?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const autoId = useId();
  const hId = headingId ?? `${autoId}-heading`;
  const bodyId = `${autoId}-body`;
  return (
    <section
      data-testid={testId}
      aria-label={label}
      aria-labelledby={label ? undefined : hId}
      className={className}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <h3 id={hId} className={headingClassName}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
              className="-ml-1 flex min-h-11 items-center gap-1 rounded-lg pr-2 pl-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                  !open && "-rotate-90",
                )}
              />
              {title}
            </button>
          </h3>
          {meta ? <div className="max-sm:-mt-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="-mr-1.5 flex shrink-0 items-center">{actions}</div>
        ) : null}
      </div>
      <div
        id={bodyId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        <div className="-mx-1 -mb-1 min-h-0 overflow-hidden px-1 pb-1">
          <div className="flex flex-col gap-3 pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
