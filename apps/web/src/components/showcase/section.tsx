import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-32 border-t pt-10"
    >
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  );
}

/** Labeled group of related states inside a section. */
export function Demo({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <div className={className}>{children}</div>
    </div>
  );
}

/**
 * Device-like frame. Children positioned `absolute` (placement="contained")
 * stay inside it, and it clips them.
 */
export function Frame({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative isolate h-[34rem] w-full overflow-hidden rounded-3xl border bg-background shadow-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}
