import { MapPin } from "lucide-react";
import { EVENT_TYPES, type EventType } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

/** Month-view chip: coloured by type, time as text. */
export function EventChip({
  type,
  title,
  time,
  onClick,
  className,
}: {
  type: EventType;
  title: string;
  /** e.g. "7:30p"; omit for all-day events. */
  time?: string;
  onClick?: () => void;
  className?: string;
}) {
  const style = EVENT_TYPES[type];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid="event-chip"
      data-type={type}
      title={`${style.label}: ${title}${time ? ` at ${time}` : ""}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[0.6875rem] leading-4 font-medium",
        style.soft,
        onClick &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", style.solid)}
      />
      {time ? (
        <span className="shrink-0 opacity-75 tabular-nums">{time}</span>
      ) : null}
      <span className="truncate">{title}</span>
    </Comp>
  );
}

function formatParts(date: Date, timeZone?: string) {
  const f = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
  return {
    month: f({ month: "short" }),
    day: f({ day: "numeric" }),
    weekday: f({ weekday: "short" }),
  };
}

/** List card for the agenda: date tile, title, time, type, optional venue. */
export function AgendaCard({
  type,
  title,
  date,
  time,
  venue,
  past,
  selected,
  timeZone,
  onClick,
  className,
}: {
  type: EventType;
  title: string;
  date: Date;
  /** Preformatted, e.g. "7:30 PM"; omit for all-day / tentative. */
  time?: string;
  venue?: string;
  past?: boolean;
  selected?: boolean;
  timeZone?: string;
  onClick?: () => void;
  className?: string;
}) {
  const style = EVENT_TYPES[type];
  const parts = formatParts(date, timeZone);
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="agenda-card"
      data-type={type}
      data-selected={selected || undefined}
      className={cn(
        "flex min-h-[4.75rem] w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left shadow-soft transition-colors outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        past && "opacity-65",
        selected && "border-primary/60 ring-1 ring-primary/40",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
          style.soft,
        )}
      >
        <span className="text-[0.65rem] font-semibold tracking-wider uppercase opacity-80">
          {parts.month}
        </span>
        <span className="mt-0.5 text-xl font-bold tabular-nums">
          {parts.day}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.95rem] leading-snug font-semibold">
          {title}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {parts.weekday}
          {" · "}
          {time ?? "All day"}
        </span>
        {venue ? (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{venue}</span>
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          style.soft,
        )}
      >
        <Icon className="size-3.5" />
        {style.label}
      </span>
    </button>
  );
}

/** The divider between past and upcoming events in the agenda. */
export function TodayLine({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-label="Today"
      data-testid="today-line"
      className={cn("flex items-center gap-2 py-2", className)}
    >
      <span className="size-2.5 rounded-full bg-today" />
      <span className="h-0.5 flex-1 rounded-full bg-today" />
      <span className="rounded-full bg-today px-2.5 py-0.5 text-xs font-bold tracking-wide text-background uppercase">
        Today
      </span>
    </div>
  );
}
