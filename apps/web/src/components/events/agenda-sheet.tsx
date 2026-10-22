"use client";

import { CalendarX2, List, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CalendarEvent } from "@greenroom/shared";
import { EmptyState } from "@/components/app/empty-state";
import { EVENT_TYPES } from "@/components/app/event-types";
import { RightSheet } from "@/components/app/right-sheet";
import { SegmentedToggle } from "@/components/app/segmented-toggle";
import { dayLabel, time12, wallClock } from "@/components/events/time";
import { useEventRanges } from "@/lib/queries/events";
import { createLocalChoice } from "@/lib/use-local-choice";
import { cn } from "@/lib/utils";

type AgendaFilter = "all" | "gig" | "practice";

const useAgendaFilter = createLocalChoice<AgendaFilter>(
  "greenroom:agenda-filter",
  ["all", "gig", "practice"],
  "all",
);

const FILTERS = [
  { value: "all", label: "All" },
  { value: "gig", label: "Gigs" },
  { value: "practice", label: "Practices" },
] as const;

// Window edges in days from today. The first chunk each way is 3 and 6 months;
// later chunks widen it as the list scrolls toward either end.
const PAST_EDGES = [0, 90, 270, 450, 630, 810];
const FUTURE_EDGES = [0, 180, 360, 540, 720, 900];
const NEAR_END_PX = 480;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function localIsoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Chronological sort key: local date, then start time (untimed first). */
function sortKey(e: CalendarEvent): string {
  const time =
    e.startsAt && !e.allDay ? wallClock(e.startsAt, e.timeZone).time : "00:00";
  return `${e.date}T${time}|${e.id}`;
}

type Chunk = {
  events: CalendarEvent[] | undefined;
  pending: boolean;
  failed: boolean;
};

/** True once the last two chunks loaded and both were empty. */
function runDry(chunks: Chunk[]): boolean {
  const tail = chunks.slice(-2);
  return (
    tail.length === 2 && tail.every((c) => !c.pending && !c.events?.length)
  );
}

/** Day label without the year when it is the current year. */
function cardDay(date: string): string {
  const label = dayLabel(date);
  const year = String(new Date().getFullYear());
  return date.startsWith(year) ? label.replace(`, ${year}`, "") : label;
}

/** "7:00 - 9:00 PM" when both ends share AM/PM, else "11:00 AM - 1:00 PM". */
function cardTime(e: CalendarEvent): string | null {
  if (e.allDay || !e.startsAt) return null;
  const start = time12(wallClock(e.startsAt, e.timeZone).time);
  if (!e.endsAt) return start;
  const end = time12(wallClock(e.endsAt, e.timeZone).time);
  const [startClock, startSuffix] = start.split(" ");
  return startSuffix === end.split(" ")[1]
    ? `${startClock} - ${end}`
    : `${start} - ${end}`;
}

function AgendaCard({
  event,
  past,
  onSelect,
}: {
  event: CalendarEvent;
  past: boolean;
  onSelect: (event: CalendarEvent) => void;
}) {
  const style = EVENT_TYPES[event.type];
  const Icon = style.icon;
  const time = cardTime(event);
  const venue = event.type === "gig" ? event.venueName : null;
  return (
    <button
      type="button"
      data-testid="agenda-card"
      data-agenda-card={past ? "past" : "upcoming"}
      data-event-type={event.type}
      onClick={() => onSelect(event)}
      className={cn(
        "flex w-full shrink-0 items-start gap-3 rounded-2xl border border-l-4 bg-card p-3 text-left shadow-soft outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted",
        style.border,
        past && "opacity-75",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          style.soft,
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {event.title}
        </span>
        <span className="block text-sm text-muted-foreground">
          <span data-testid="agenda-date">{cardDay(event.date)}</span>
          {time ? (
            <span data-testid="agenda-time" className="block">
              {time}
            </span>
          ) : null}
        </span>
        {venue ? (
          <span data-testid="agenda-venue" className="block truncate text-sm">
            {venue}
          </span>
        ) : null}
      </span>
      <span
        data-testid="agenda-type"
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          style.soft,
        )}
      >
        {style.label}
      </span>
    </button>
  );
}

function Spinner() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-center">
      <Loader2
        aria-label="Loading"
        className="size-4 animate-spin text-muted-foreground"
      />
    </div>
  );
}

/** Floating secondary button above the + FAB that opens the agenda. */
export function AgendaButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Agenda"
      onClick={onClick}
      className="fixed right-[calc(1rem+0.375rem)] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem+3.5rem+0.75rem)] z-30 flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-lift ring-1 ring-foreground/10 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 md:bottom-[calc(1.5rem+3.5rem+0.75rem)]"
    >
      <List className="size-5" />
    </button>
  );
}

/**
 * Right-hand sheet listing past and upcoming events as one timeline split by a
 * "today" line. It opens with the line in view and a sliver of the latest past
 * card above it, and widens its fetch window as either end is approached.
 */
export function AgendaSheet({
  open,
  onOpenChange,
  bandId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandId: string | undefined;
  onSelect: (event: CalendarEvent) => void;
}) {
  const [filter, setFilterRaw] = useAgendaFilter();
  const [start, setStart] = useState(startOfToday);
  const [pastCount, setPastCount] = useState(1);
  const [futureCount, setFutureCount] = useState(1);
  const [wasOpen, setWasOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  // Each open starts from a fresh "today" and the initial window.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTouched(true);
      setStart(startOfToday());
      setPastCount(1);
      setFutureCount(1);
    }
  }

  const pastRanges = useMemo(
    () =>
      Array.from({ length: pastCount }, (_, i) => ({
        from: addDays(start, -PAST_EDGES[i + 1]!).toISOString(),
        to: addDays(start, -PAST_EDGES[i]!).toISOString(),
      })),
    [start, pastCount],
  );
  const futureRanges = useMemo(
    () =>
      Array.from({ length: futureCount }, (_, i) => ({
        from: addDays(start, FUTURE_EDGES[i]!).toISOString(),
        to: addDays(start, FUTURE_EDGES[i + 1]!).toISOString(),
      })),
    [start, futureCount],
  );
  const chunks = useEventRanges(touched ? bandId : undefined, [
    ...pastRanges,
    ...futureRanges,
  ]);
  const pastChunks = chunks.slice(0, pastCount);
  const futureChunks = chunks.slice(pastCount);

  const pastBusy = pastChunks.some((c) => c.pending);
  const futureBusy = futureChunks.some((c) => c.pending);
  const pastDone = pastCount >= PAST_EDGES.length - 1 || runDry(pastChunks);
  const futureDone =
    futureCount >= FUTURE_EDGES.length - 1 || runDry(futureChunks);
  const ready =
    !!bandId && !pastChunks[0]?.pending && !futureChunks[0]?.pending;

  const todayStr = localIsoDate(start);
  const { past, upcoming } = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const c of chunks) {
      for (const e of c.events ?? []) {
        if (filter === "all" || e.type === filter) byId.set(e.id, e);
      }
    }
    const sorted = [...byId.values()].sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b)),
    );
    return {
      past: sorted.filter((e) => e.date < todayStr),
      upcoming: sorted.filter((e) => e.date >= todayStr),
    };
  }, [chunks, filter, todayStr]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const lineY = useRef<number | null>(null);

  const setFilter = (next: AgendaFilter) => {
    positioned.current = false;
    setFilterRaw(next);
  };

  // Scroll position: land on the today line once data is in, then keep the
  // line fixed on screen when older events are prepended above it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const line = todayRef.current;
    if (!open) {
      positioned.current = false;
      lineY.current = null;
      return;
    }
    if (!el || !line) return;
    const top = el.getBoundingClientRect().top;
    const yOf = (node: Element) =>
      node.getBoundingClientRect().top - top + el.scrollTop;
    const y = yOf(line);
    if (!positioned.current) {
      if (!ready) return;
      const cards = el.querySelectorAll('[data-agenda-card="past"]');
      const last = cards[cards.length - 1];
      // The sticky filter row covers the top of the body, so offset by it.
      const covered = filterRef.current?.offsetHeight ?? 0;
      el.scrollTop = last
        ? yOf(last) + last.getBoundingClientRect().height / 2 - covered
        : Math.max(0, y - covered - 24);
      positioned.current = true;
    } else if (lineY.current !== null && y !== lineY.current) {
      el.scrollTop += y - lineY.current;
    }
    lineY.current = y;
  });

  const extendIfNearEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el || (todayRef.current && !positioned.current)) return;
    if (el.scrollTop < NEAR_END_PX && !pastBusy && !pastDone) {
      setPastCount((n) => n + 1);
    }
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (bottom < NEAR_END_PX && !futureBusy && !futureDone) {
      setFutureCount((n) => n + 1);
    }
  }, [pastBusy, pastDone, futureBusy, futureDone]);

  useEffect(() => {
    const el = scrollRef.current;
    el?.addEventListener("scroll", extendIfNearEnd, { passive: true });
    return () => el?.removeEventListener("scroll", extendIfNearEnd);
  }, [extendIfNearEnd]);

  // Short lists never scroll, so also check after each load.
  const settled = `${pastCount}:${futureCount}:${past.length}:${upcoming.length}:${ready}`;
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(extendIfNearEnd);
    return () => cancelAnimationFrame(frame);
  }, [extendIfNearEnd, settled]);

  const empty = ready && !past.length && !upcoming.length;
  const settledEmpty =
    empty && pastDone && futureDone && !pastBusy && !futureBusy;

  return (
    <RightSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Agenda"
      bodyRef={scrollRef}
      bodyClassName="p-0 [overflow-anchor:none]"
    >
      <div
        ref={filterRef}
        data-testid="agenda-filter"
        className="sticky top-0 z-10 border-b bg-card px-4 py-2"
      >
        <SegmentedToggle<AgendaFilter>
          label="Filter events"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS}
          className="w-full"
        />
      </div>
      <div
        className="flex min-h-full flex-col gap-2.5 px-4 pt-3"
        data-testid="agenda-list"
      >
        {!ready || (empty && !settledEmpty) ? (
          <Spinner />
        ) : settledEmpty ? (
          <EmptyState
            icon={CalendarX2}
            title="No events yet"
            description={
              filter === "all"
                ? "Gigs and practices you add will show up here."
                : `No ${filter === "gig" ? "gigs" : "practices"} to show.`
            }
          />
        ) : (
          <>
            {pastDone ? (
              <p className="flex h-8 shrink-0 items-center justify-center text-xs text-muted-foreground">
                No earlier events
              </p>
            ) : (
              <Spinner />
            )}
            {past.map((e) => (
              <AgendaCard key={e.id} event={e} past onSelect={onSelect} />
            ))}
            <div
              ref={todayRef}
              role="separator"
              aria-label="Today"
              data-testid="agenda-today"
              className="flex shrink-0 items-center gap-2 py-1.5"
            >
              <span className="h-0.5 flex-1 rounded-full bg-today" />
              <span className="rounded-full bg-today px-2 py-0.5 text-xs font-semibold text-white">
                Today
              </span>
              <span className="h-0.5 flex-1 rounded-full bg-today" />
            </div>
            <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-2.5 pb-8">
              {upcoming.length ? (
                upcoming.map((e) => (
                  <AgendaCard
                    key={e.id}
                    event={e}
                    past={false}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  Nothing coming up
                </p>
              )}
              {futureDone ? (
                <p className="flex h-8 shrink-0 items-center justify-center text-xs text-muted-foreground">
                  No later events
                </p>
              ) : (
                <Spinner />
              )}
            </div>
          </>
        )}
      </div>
    </RightSheet>
  );
}
