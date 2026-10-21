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

export type CalendarMode = "month" | "week";

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

function renderEvent(arg: EventContentArg) {
  const ev = eventOf(arg);
  const style = EVENT_TYPES[ev.type];
  const month = arg.view.type === "dayGridMonth";
  const time =
    ev.startsAt && !ev.allDay
      ? timeShort(wallClock(ev.startsAt, ev.timeZone).time)
      : null;
  if (month) {
    return (
      <div className="gr-chip">
        <span aria-hidden="true" className={`gr-dot ${style.solid}`} />
        {time ? <span className="gr-chip-time">{time}</span> : null}
        <span className="gr-chip-title">{ev.title}</span>
      </div>
    );
  }
  return (
    <div className="gr-block">
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
}: {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** `YYYY-MM-DD`; the calendar jumps there when it is outside the visible range. */
  focusDate?: string;
  events: CalendarEvent[];
  onRangeChange: (range: { from: string; to: string }) => void;
  onDayClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
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

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (!api || !focusDate) return;
    const at = new Date(`${focusDate}T12:00:00`);
    if (at < api.view.activeStart || at >= api.view.activeEnd) {
      api.gotoDate(focusDate);
    }
  }, [focusDate]);

  const nav = (fn: "prev" | "next" | "today") => calRef.current?.getApi()[fn]();

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
        eventClassNames={(arg) => ["gr-event", `gr-${eventOf(arg).type}`]}
        eventContent={renderEvent}
        dayHeaderContent={renderDayHeader}
        datesSet={(arg) => {
          setTitle(arg.view.title);
          onRangeChange(paddedRange(arg));
        }}
        dateClick={(arg) => onDayClick(arg.dateStr.slice(0, 10))}
        eventClick={(arg) => {
          arg.jsEvent.preventDefault();
          onEventClick(eventOf(arg));
        }}
      />
    </div>
  );
}
