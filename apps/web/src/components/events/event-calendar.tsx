"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DatesSetArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@greenroom/shared";
import { EVENT_TYPES } from "@/components/app/event-types";
import { SegmentedToggle } from "@/components/app/segmented-toggle";
import { Button } from "@/components/ui/button";
import {
  timeRange,
  timeShort,
  toCalendarInput,
  wallClock,
} from "@/components/events/time";
import "@/components/events/calendar.css";
import "@/components/events/calendar-effects.css";

export type CalendarMode = "month" | "week";

export type SelectedEvent =
  | { type: "gig"; id: string }
  | { type: "practice"; seriesId: string; date: string | null };

const VIEW_TYPE = { month: "dayGridMonth", week: "timeGridWeek" } as const;
const DAY_MS = 86_400_000;

/** Fetch window for a visible range, padded a day each side for zone differences. */
function paddedRange(arg: DatesSetArg) {
  return {
    from: new Date(arg.start.getTime() - DAY_MS).toISOString(),
    to: new Date(arg.end.getTime() + DAY_MS).toISOString(),
  };
}

function eventOf(arg: EventContentArg | EventClickArg): CalendarEvent {
  return arg.event.extendedProps.event as CalendarEvent;
}

function isSelected(ev: CalendarEvent, sel: SelectedEvent | null | undefined) {
  if (!sel || sel.type !== ev.type) return false;
  if (sel.type === "gig") return ev.type === "gig" && ev.id === sel.id;
  return (
    ev.type === "practice" &&
    sel.date !== null &&
    ev.seriesId === sel.seriesId &&
    ev.date === sel.date
  );
}

const SLIDE_MS = 250;
const SWIPE_MIN_PX = 50;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Extra chip lines in priority order; the chip clips whatever does not fit. */
function chipDetails(ev: CalendarEvent): string[] {
  const lines: string[] = [];
  const range = timeRange(ev);
  if (range) lines.push(range);
  if (ev.type === "gig") {
    if (ev.venueName) lines.push(ev.venueName);
    const n = ev.lineupUserIds.length;
    if (n > 0) lines.push(`${n} in lineup`);
  } else {
    lines.push(ev.location ? ev.location : "Practice");
    if (ev.location) lines.push("Practice");
  }
  return lines;
}

function renderEvent(
  arg: EventContentArg,
  sel: SelectedEvent | null | undefined,
) {
  const ev = eventOf(arg);
  const style = EVENT_TYPES[ev.type];
  const selected = isSelected(ev, sel) ? "true" : undefined;
  const month = arg.view.type === "dayGridMonth";
  const time =
    ev.startsAt && !ev.allDay
      ? timeShort(wallClock(ev.startsAt, ev.timeZone).time)
      : null;
  if (month) {
    const details = chipDetails(ev);
    return (
      <div className="gr-chip" data-selected={selected}>
        <div className="gr-chip-head">
          <span aria-hidden="true" className={`gr-dot ${style.solid}`} />
          {time ? <span className="gr-chip-time">{time}</span> : null}
          <span className="gr-chip-title">{ev.title}</span>
        </div>
        {details.length > 0 ? (
          <div className="gr-chip-details" data-testid="chip-details">
            {details.map((d) => (
              <span key={d} className="gr-chip-detail">
                {d}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="gr-block" data-selected={selected}>
      <span className="gr-block-title">{ev.title}</span>
      {arg.event.allDay ? null : (
        <span className="gr-block-time">{timeRange(ev)}</span>
      )}
    </div>
  );
}

function renderDayHeader(arg: DayHeaderContentArg) {
  if (arg.view.type === "dayGridMonth") return arg.text;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
    arg.date,
  );
  return (
    <span className="gr-day-head">
      <span>{weekday}</span>
      <span className="gr-day-num">{arg.date.getDate()}</span>
    </span>
  );
}

/**
 * Month/week calendar styled to the app's tokens. Events are placed by their own
 * zone's wall clock, so the grid reads the same wherever the browser is.
 */
export function EventCalendar({
  mode,
  onModeChange,
  focusDate,
  events,
  onRangeChange,
  onDayClick,
  onEventClick,
  selectedEvent,
}: {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** `YYYY-MM-DD`; the calendar jumps there when it is outside the visible range. */
  focusDate?: string;
  events: CalendarEvent[];
  onRangeChange: (range: { from: string; to: string }) => void;
  onDayClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  selectedEvent?: SelectedEvent | null;
}) {
  const calRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const inputs = useMemo(() => events.map(toCalendarInput), [events]);
  const [initialDate] = useState(focusDate);

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api && api.view.type !== VIEW_TYPE[mode]) {
      api.changeView(VIEW_TYPE[mode]);
    }
  }, [mode]);

  const gridRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const swipedAt = useRef(0);

  /**
   * Runs a period change and slides the grid: a frozen copy of the old grid
   * leaves one way while the live grid enters from the other.
   */
  const slide = (dir: 1 | -1, change: () => void) => {
    const grid = gridRef.current;
    const host = grid?.parentElement;
    if (!grid || !host || reducedMotion()) return change();
    const ghost = grid.cloneNode(true) as HTMLElement;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.removeAttribute("data-grid");
    Object.assign(ghost.style, {
      position: "absolute",
      top: `${grid.offsetTop}px`,
      left: "0",
      width: "100%",
      pointerEvents: "none",
    });
    host.appendChild(ghost);
    change();
    const opts = { duration: SLIDE_MS, easing: "ease-out" } as const;
    ghost
      .animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: `translateX(${-dir * 40}%)`, opacity: 0 },
        ],
        opts,
      )
      .finished.catch(() => {})
      .finally(() => ghost.remove());
    grid.animate(
      [
        { transform: `translateX(${dir * 40}%)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      opts,
    );
  };

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (!api || !focusDate) return;
    const at = new Date(`${focusDate}T12:00:00`);
    if (at < api.view.activeStart || at >= api.view.activeEnd) {
      slide(at > api.view.activeStart ? 1 : -1, () => api.gotoDate(focusDate));
    }
  }, [focusDate]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(() =>
      calRef.current?.getApi().updateSize(),
    );
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const nav = (fn: "prev" | "next" | "today") => {
    const api = calRef.current?.getApi();
    if (!api) return;
    if (fn === "today") {
      const now = new Date();
      if (now >= api.view.activeStart && now < api.view.activeEnd) return;
      return slide(now > api.view.activeStart ? 1 : -1, () => api.today());
    }
    slide(fn === "next" ? 1 : -1, () => api[fn]());
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      swipedAt.current = Date.now();
      nav(dx < 0 ? "next" : "prev");
    }
  };
  const justSwiped = () => Date.now() - swipedAt.current < 500;

  return (
    <div data-testid="calendar" data-view={mode} className="gr-cal">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-3">
        <h2
          data-testid="calendar-title"
          aria-live="polite"
          className="min-w-0 flex-1 basis-44 truncate text-lg font-semibold"
        >
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => nav("today")}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous"
            onClick={() => nav("prev")}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next"
            onClick={() => nav("next")}
          >
            <ChevronRight />
          </Button>
        </div>
        <SegmentedToggle
          label="Calendar view"
          value={mode}
          onValueChange={onModeChange}
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
          ]}
        />
      </div>
      <div
        className="relative touch-pan-y overflow-x-clip"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchRef.current =
            e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => (touchRef.current = null)}
      >
        <div ref={gridRef} data-grid>
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={VIEW_TYPE[mode]}
            initialDate={initialDate}
            headerToolbar={false}
            height={mode === "week" ? "calc(100dvh - 15rem)" : "auto"}
            fixedWeekCount={false}
            dayMaxEvents={3}
            nowIndicator
            allDayText="All day"
            slotDuration="01:00:00"
            slotLabelFormat={{ hour: "numeric", meridiem: "short" }}
            scrollTime="17:00:00"
            eventDisplay="block"
            dayHeaderFormat={{ weekday: "short" }}
            events={inputs}
            eventClassNames={(arg) => {
              const ev = eventOf(arg);
              return [
                "gr-event",
                `gr-${ev.type}`,
                ...(isSelected(ev, selectedEvent) ? ["gr-selected"] : []),
              ];
            }}
            eventContent={(arg) => renderEvent(arg, selectedEvent)}
            dayHeaderContent={renderDayHeader}
            datesSet={(arg) => {
              setTitle(arg.view.title);
              onRangeChange(paddedRange(arg));
            }}
            dateClick={(arg) => {
              if (!justSwiped()) onDayClick(arg.dateStr.slice(0, 10));
            }}
            eventClick={(arg) => {
              arg.jsEvent.preventDefault();
              if (!justSwiped()) onEventClick(eventOf(arg));
            }}
          />
        </div>
      </div>
    </div>
  );
}
