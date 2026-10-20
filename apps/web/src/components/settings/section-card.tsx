import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Titled card used for each settings section. */
export function SectionCard({
  id,
  title,
  children,
  className,
  testId,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className={cn(
        "flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft",
        className,
      )}
    >
      <h2 id={id} className="text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Polite "Saved" confirmation shown after a successful save. */
export function SavedNote({ show }: { show: boolean }) {
  return (
    <span role="status" className="text-sm text-muted-foreground">
      {show ? "Saved" : ""}
    </span>
  );
}
