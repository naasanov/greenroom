import { cn } from "@/lib/utils";
import {
  allItems,
  type Plan,
  type PlanTask,
  type StatusKind,
} from "@/lib/plan";
import { Hand } from "lucide-react";
import { Linkified } from "./linkified";
import { STATUS_META } from "./status-meta";

const KINDS: StatusKind[] = [
  "done",
  "in-progress",
  "review",
  "blocked",
  "not-started",
];

export function Summary({ plan }: { plan: Plan }) {
  const items = allItems(plan);
  const tasks = items.filter((i): i is PlanTask => i.type === "task");
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
    StatusKind,
    number
  >;
  for (const t of tasks) counts[t.status.kind]++;
  const pct = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0;

  const gates = items.filter((i) => i.type === "gate");
  const reviewGates = gates.filter((g) => g.status.kind === "review");
  const manualOpen = plan.manual.filter((m) => m.status.kind !== "done");
  const nothing = reviewGates.length === 0 && manualOpen.length === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Overall progress
          </h2>
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums">
              {counts.done}
            </span>
            <span className="text-muted-foreground">
              {" "}
              / {tasks.length} tasks
            </span>
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-going"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {KINDS.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", STATUS_META[k].dot)} />
              <span className="tabular-nums font-medium">{counts[k]}</span>
              <span className="text-muted-foreground">
                {STATUS_META[k].label}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {gates.filter((g) => g.status.kind === "done").length} of{" "}
          {gates.length} review gates passed
        </p>
      </section>

      <section
        className={cn(
          "rounded-2xl border-2 p-4",
          nothing ? "border-border bg-card" : "border-today bg-today/10",
        )}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Hand className={cn("size-4", !nothing && "text-today")} />
          Needs you
        </h2>
        {nothing ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing is waiting on you right now.
          </p>
        ) : (
          <ul className="mt-2 space-y-3 text-sm">
            {reviewGates.map((g) =>
              g.type === "gate" ? (
                <li key={g.number}>
                  <p className="font-medium">
                    Gate {g.number}: {g.title}
                  </p>
                  <p className="text-muted-foreground">
                    <Linkified text={g.status.text} />
                  </p>
                </li>
              ) : null,
            )}
            {manualOpen.map((m) => (
              <li key={m.name}>
                <p className="font-medium">{m.name}</p>
                <p className="text-muted-foreground">
                  <Linkified text={m.status.text} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
