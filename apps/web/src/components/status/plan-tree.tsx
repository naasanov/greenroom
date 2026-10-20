import { ChevronDown, Flag, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  currentItem,
  type Plan,
  type PlanGate,
  type PlanItem,
  type PlanPhase,
  type PlanTask,
} from "@/lib/plan";
import { Linkified } from "./linkified";
import { StatusBadge } from "./status-badge";
import { STATUS_META } from "./status-meta";

export function PlanTree({ plan }: { plan: Plan }) {
  const current = currentItem(plan);
  return (
    <ol className="relative">
      <div
        aria-hidden
        className="absolute inset-y-0 left-4 w-px -translate-x-1/2 bg-border"
      />
      {plan.phases.map((phase) => (
        <PhaseNode key={phase.number} phase={phase} current={current} />
      ))}
    </ol>
  );
}

function phaseKind(phase: PlanPhase) {
  const kinds = phase.items.map((i) => i.status.kind);
  if (kinds.length && kinds.every((k) => k === "done")) return "done";
  if (kinds.some((k) => k !== "not-started")) return "in-progress";
  return "not-started";
}

function PhaseNode({
  phase,
  current,
}: {
  phase: PlanPhase;
  current: PlanItem | null;
}) {
  const kind = phaseKind(phase);
  const tasks = phase.items.filter((i) => i.type === "task");
  const done = tasks.filter((t) => t.status.kind === "done").length;
  const Icon = STATUS_META[kind].icon;
  return (
    <li className="relative pb-8 pl-12">
      <span
        className={cn(
          "absolute left-0 top-0 grid size-8 place-items-center rounded-full border-2",
          STATUS_META[kind].node,
        )}
      >
        {kind === "done" ? (
          <Icon className="size-4" />
        ) : (
          <span className="text-sm font-semibold">{phase.number}</span>
        )}
      </span>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold">
          <span className="text-muted-foreground">Phase {phase.number}</span>{" "}
          {phase.title}
        </h2>
        {tasks.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {done}/{tasks.length}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2.5">
        {phase.items.map((item) => {
          const here = item === current;
          return item.type === "gate" ? (
            <GateNode key={`g${item.number}`} gate={item} here={here} />
          ) : (
            <TaskNode key={item.id} task={item} here={here} />
          );
        })}
      </ul>
    </li>
  );
}

function HereMarker() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
      <MapPin className="size-3" />
      You are here
    </span>
  );
}

function Detail({
  description,
  statusText,
}: {
  description: string;
  statusText: string;
}) {
  return (
    <div className="space-y-2 border-t px-3 py-2.5 text-sm text-muted-foreground">
      {description && <p className="break-words">{description}</p>}
      <p className="break-words">
        <span className="font-medium text-foreground">Status: </span>
        <Linkified text={statusText} />
      </p>
    </div>
  );
}

function TaskNode({ task, here }: { task: PlanTask; here: boolean }) {
  const meta = STATUS_META[task.status.kind];
  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute -left-8 top-[1.375rem] h-px w-8 bg-border"
      />
      <span
        aria-hidden
        className={cn(
          "absolute -left-8 top-[1.375rem] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
          meta.node,
          task.status.kind === "in-progress" && "animate-pulse",
        )}
      />
      <details
        open={["in-progress", "review", "blocked"].includes(task.status.kind)}
        className={cn(
          "group overflow-hidden rounded-xl border bg-card",
          meta.border,
          here && "ring-2 ring-foreground/70",
        )}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            {here && (
              <div className="mb-1">
                <HereMarker />
              </div>
            )}
            <p className="text-sm font-medium leading-snug">
              <span className="mr-1.5 tabular-nums text-muted-foreground">
                {task.id}
              </span>
              {task.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind={task.status.kind} />
              {task.group && (
                <span className="text-[11px] text-muted-foreground">
                  Group {task.group}
                </span>
              )}
            </div>
          </div>
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <Detail description={task.description} statusText={task.status.text} />
      </details>
    </li>
  );
}

function GateNode({ gate, here }: { gate: PlanGate; here: boolean }) {
  const meta = STATUS_META[gate.status.kind];
  const active =
    gate.status.kind !== "not-started" && gate.status.kind !== "done";
  return (
    <li className="relative py-1">
      <span aria-hidden className="absolute -left-8 top-6 h-px w-8 bg-border" />
      <span
        aria-hidden
        className={cn(
          "absolute -left-8 top-6 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2",
          meta.node,
          gate.status.kind === "review" && "animate-pulse",
        )}
      >
        <Flag className="size-3.5" />
      </span>
      <details
        open={["in-progress", "review", "blocked"].includes(gate.status.kind)}
        className={cn(
          "group overflow-hidden rounded-xl border-2 bg-card",
          meta.border,
          active && gate.status.kind === "review" && "bg-today/10",
          here &&
            "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
        )}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            {here && (
              <div className="mb-1">
                <HereMarker />
              </div>
            )}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Review gate {gate.number}
            </p>
            <p className="text-sm font-semibold leading-snug">{gate.title}</p>
            <div className="mt-1.5">
              <StatusBadge kind={gate.status.kind} />
            </div>
          </div>
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <Detail description={gate.description} statusText={gate.status.text} />
      </details>
    </li>
  );
}
