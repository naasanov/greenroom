import { ChevronDown, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/plan";
import { findSection, type SetupSection } from "@/lib/setup-doc";
import { Linkified } from "./linkified";
import { Inline, SetupMarkdown } from "./setup-markdown";
import { StatusBadge } from "./status-badge";
import { STATUS_META } from "./status-meta";

export function ManualSetup({
  plan,
  sections,
}: {
  plan: Plan;
  sections: SetupSection[];
}) {
  if (plan.manual.length === 0) return null;
  const handover = findSection(sections, "How to hand over secrets");
  const firstOpen = plan.manual.findIndex((m) => m.status.kind !== "done");

  return (
    <section id="manual-setup" className="space-y-3">
      <h2 className="text-base font-semibold">Manual setup</h2>
      {handover && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4" />
            {handover.heading}
          </h3>
          <SetupMarkdown body={handover.body} />
        </div>
      )}
      <ul className="space-y-2.5">
        {plan.manual.map((item, i) => {
          const section = findSection(sections, item.name);
          return (
            <li key={item.name}>
              <details
                open={i === firstOpen}
                className={cn(
                  "group overflow-hidden rounded-xl border bg-card",
                  STATUS_META[item.status.kind].border,
                )}
              >
                <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {item.name}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge kind={item.status.kind} />
                    </div>
                  </div>
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t px-3 py-2.5 text-sm text-muted-foreground">
                  {item.description && (
                    <p className="break-words">
                      <Inline text={item.description} />
                    </p>
                  )}
                  <p className="break-words">
                    <span className="font-medium text-foreground">
                      Status:{" "}
                    </span>
                    <Linkified text={item.status.text} />
                  </p>
                  {section && (
                    <div className="border-t pt-3">
                      <SetupMarkdown body={section.body} />
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
