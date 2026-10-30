import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline validation message under a field. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Sticky action bar at the bottom of a drawer form, with an optional server error.
 * It reaches through the drawer body's bottom padding so it sits flush with the edge.
 */
export function FormActions({
  error,
  children,
}: {
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-[calc(-1*max(1.5rem,env(safe-area-inset-bottom)))] -mx-5 mt-1 mb-[calc(-1*max(1.5rem,env(safe-area-inset-bottom)))] flex flex-col gap-2 border-t bg-popover px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

/** Native select styled like Input; native pickers are the best touch experience. */
export function NativeSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-xl border border-input bg-transparent px-3.5 pr-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-3.5 right-3.5 size-4 text-muted-foreground"
      />
    </div>
  );
}

/** WebKit gives native date and time inputs an intrinsic width; this lets the grid size them. */
export const NATIVE_DATE_TIME_INPUT =
  "block min-w-0 w-full max-w-full appearance-none [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";
