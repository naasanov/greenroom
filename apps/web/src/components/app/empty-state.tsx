import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-3xl bg-gig-soft text-gig-soft-foreground">
        <Icon className="size-7" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        {description ? (
          <p className="max-w-xs text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
