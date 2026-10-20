import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusKind } from "@/lib/plan";
import { STATUS_META } from "./status-meta";

export function StatusBadge({
  kind,
  className,
}: {
  kind: StatusKind;
  className?: string;
}) {
  const meta = STATUS_META[kind];
  const Icon = meta.icon;
  return (
    <Badge className={cn("h-6 gap-1 px-2.5", meta.badge, className)}>
      <Icon className={cn(kind === "in-progress" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
