"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";
import { SideDrawer } from "@/components/app/bottom-drawer";
import { PickerRow } from "@/components/setlists/pick-dnd";
import { cn } from "@/lib/utils";
import { PersonLine, PersonOverlay } from "./person-row";
import { LINEUP_TARGET, type LineupBuilder } from "./use-lineup-builder";

/** Where the roster drawer goes when there is no room beside the gig drawer. */
const OVERLAY_CLASS = "right-0 w-full";

/** Beside the gig drawer: bottom-aligned and tall even when the drawer is short. */
const SIDE_CLASS = "inset-y-auto bottom-0 h-[min(34rem,85dvh)]";

/** The roster drawer: pass inside the `BottomDrawer` `aside`. */
export function LineupAside({ builder }: { builder: LineupBuilder }) {
  const { members } = builder;
  const inLineup = useMemo(
    () => new Set(builder.lineup?.members.map((m) => m.membershipId)),
    [builder.lineup?.members],
  );
  const draggable = builder.mode === "side";

  return (
    <SideDrawer
      open={builder.rosterOpen}
      onOpenChange={builder.setRosterOpen}
      title="Band members"
      className={
        builder.mode === "overlay"
          ? OVERLAY_CLASS
          : builder.mode === "side"
            ? SIDE_CLASS
            : undefined
      }
    >
      <div data-testid="roster-picker" className="pt-1">
        {!members ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading...
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Band members">
            {members.map((m) => {
              const checked = inLineup.has(m.membershipId);
              return (
                <PickerRow
                  key={m.membershipId}
                  targetId={LINEUP_TARGET}
                  itemId={m.membershipId}
                  draggable={draggable && !checked}
                  overlay={<PersonOverlay person={m} member={m} />}
                >
                  <button
                    type="button"
                    aria-pressed={checked}
                    aria-label={m.displayName}
                    data-checked={checked}
                    onClick={() => builder.toggle(m)}
                    className={cn(
                      "flex h-14 w-full touch-manipulation items-center gap-2.5 rounded-2xl border bg-card px-2.5 shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                      draggable && !checked && "cursor-grab",
                    )}
                  >
                    <PersonLine person={m} member={m} />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {checked ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : null}
                    </span>
                  </button>
                </PickerRow>
              );
            })}
          </ul>
        )}
      </div>
    </SideDrawer>
  );
}
