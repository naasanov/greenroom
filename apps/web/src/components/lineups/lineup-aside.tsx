"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  History,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { LineupHistoryEntry } from "@greenroom/shared";
import { SideDrawer } from "@/components/app/bottom-drawer";
import { EmptyState } from "@/components/app/empty-state";
import { useDebounced } from "@/components/library/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLineup, useLineupHistory } from "@/lib/queries/lineups";
import { PickerRow } from "@/components/setlists/pick-dnd";
import { cn } from "@/lib/utils";
import { PersonLine, PersonOverlay } from "./person-row";
import { LINEUP_TARGET, type LineupBuilder } from "./use-lineup-builder";

/** Where the roster drawer goes when there is no room beside the gig drawer. */
const OVERLAY_CLASS = "right-0 w-full";

/** Beside the gig drawer: bottom-aligned and tall even when the drawer is short. */
const SIDE_CLASS = "inset-y-auto bottom-0 h-[min(34rem,85dvh)]";

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));

/** Mounted only while expanded, so the lineup loads on demand. */
function HistoryPreview({ bandId, gigId }: { bandId: string; gigId: string }) {
  const detail = useLineup(bandId, gigId);
  return (
    <div data-testid="lineup-history-preview" className="border-t px-3 py-2">
      {detail.data ? (
        detail.data.members.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {detail.data.members.map((m) => (
              <li key={m.membershipId} className="truncate text-sm">
                {m.displayName}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No members.</p>
        )
      ) : detail.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load members.
        </p>
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          Loading...
        </p>
      )}
    </div>
  );
}

function HistoryRow({
  entry: e,
  builder,
}: {
  entry: LineupHistoryEntry;
  builder: LineupBuilder;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border bg-card shadow-soft">
      <div className="flex items-stretch">
        <button
          type="button"
          data-testid="lineup-history-entry"
          disabled={builder.copyPending}
          onClick={() => builder.copyFromGig(e)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-2xl px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          <span className="truncate text-sm font-semibold">{e.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[
              e.venueName,
              dayLabel(e.date),
              `${e.memberCount} ${e.memberCount === 1 ? "member" : "members"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <button
          type="button"
          data-testid="lineup-history-preview-toggle"
          aria-expanded={open}
          aria-label={`Preview members in ${e.title}`}
          onClick={() => setOpen((v) => !v)}
          className="flex w-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {open ? <HistoryPreview bandId={builder.bandId} gigId={e.gigId} /> : null}
    </li>
  );
}

function HistoryView({ builder }: { builder: LineupBuilder }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const history = useLineupHistory(builder.bandId, q);
  const entries = history.data?.filter((e) => e.gigId !== builder.gigId);

  return (
    <div data-testid="lineup-history-picker">
      <div className="sticky top-0 z-10 -mx-1 bg-popover px-1 pt-1 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search past gigs"
            placeholder="Search by title or venue"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => setSearch("")}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      {builder.copyFailed ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          Could not copy that lineup.
        </p>
      ) : null}
      {!entries ? (
        history.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load past gigs.
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading...
          </p>
        )
      ) : entries.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Past gigs">
          {entries.map((e) => (
            <HistoryRow key={e.gigId} entry={e} builder={builder} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title={q ? "No past gigs match" : "No earlier gig has a lineup yet."}
        />
      )}
    </div>
  );
}

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
      title={builder.historyOpen ? "Copy from a past gig" : "Band members"}
      rise
      headerAction={
        builder.historyOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to band members"
            onClick={() => builder.setHistoryOpen(false)}
          >
            <ArrowLeft />
          </Button>
        ) : undefined
      }
      className={
        builder.mode === "overlay"
          ? OVERLAY_CLASS
          : builder.mode === "side"
            ? SIDE_CLASS
            : undefined
      }
    >
      {builder.historyOpen ? (
        <HistoryView builder={builder} />
      ) : (
        <div data-testid="roster-picker" className="pt-1">
          <Button
            type="button"
            variant="outline"
            className="mb-3 w-full"
            onClick={() => builder.setHistoryOpen(true)}
          >
            <History /> Copy from a past gig
          </Button>
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
      )}
    </SideDrawer>
  );
}
