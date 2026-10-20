import { Check, CircleDashed, HelpCircle, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InstrumentIcon } from "@/components/app/instruments";
import { toneFor } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

export type RsvpStatus = "going" | "maybe" | "none" | "declined";

const RSVP: Record<
  RsvpStatus,
  { label: string; badge: string; order: number }
> = {
  going: { label: "Going", badge: "bg-going text-background", order: 0 },
  maybe: { label: "Maybe", badge: "bg-maybe text-background", order: 1 },
  none: {
    label: "No response",
    badge:
      "border border-dashed border-muted-foreground/50 text-muted-foreground",
    order: 2,
  },
  declined: {
    label: "Not going",
    badge: "bg-declined/15 text-declined",
    order: 3,
  },
};

export const RSVP_STATUSES = Object.keys(RSVP) as RsvpStatus[];

export function rsvpLabel(status: RsvpStatus): string {
  return RSVP[status].label;
}

/** Round status badge: check, question mark, X, or a dashed neutral circle. */
export function RsvpIcon({
  status,
  className,
}: {
  status: RsvpStatus;
  className?: string;
}) {
  const Icon = {
    going: Check,
    maybe: HelpCircle,
    declined: X,
    none: CircleDashed,
  }[status];
  return (
    <span
      role="img"
      aria-label={RSVP[status].label}
      data-status={status}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
        RSVP[status].badge,
        className,
      )}
    >
      {status === "none" ? null : (
        <Icon className="size-4" strokeWidth={status === "maybe" ? 2.5 : 3} />
      )}
    </span>
  );
}

export interface Attendee {
  id: string;
  name: string;
  imageUrl?: string | null;
  status: RsvpStatus;
  instruments?: string[];
}

/** Going, maybe, no response, then not going; stable within a group. */
export function sortAttendees<T extends Pick<Attendee, "status">>(
  attendees: readonly T[],
): T[] {
  return attendees
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) => RSVP[x.a.status].order - RSVP[y.a.status].order || x.i - y.i,
    )
    .map(({ a }) => a);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** One attendee list, Google Calendar style, with an RSVP icon per person. */
export function AttendeeList({
  attendees,
  className,
}: {
  attendees: readonly Attendee[];
  className?: string;
}) {
  const sorted = sortAttendees(attendees);
  const counts = RSVP_STATUSES.map((s) => ({
    status: s,
    n: attendees.filter((a) => a.status === s).length,
  })).filter((c) => c.n > 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-sm text-muted-foreground">
        {counts
          .map((c) => `${c.n} ${RSVP[c.status].label.toLowerCase()}`)
          .join(" · ") || "No attendees"}
      </p>
      <ul className="flex flex-col" data-testid="attendee-list">
        {sorted.map((a) => (
          <li
            key={a.id}
            data-status={a.status}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl px-1 py-1.5",
              a.status === "declined" && "opacity-60",
            )}
          >
            <Avatar className="size-10">
              {a.imageUrl ? <AvatarImage src={a.imageUrl} alt="" /> : null}
              <AvatarFallback className={toneFor(a.id)}>
                {initials(a.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              {a.instruments?.length ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                  {a.instruments.map((i) => (
                    <InstrumentIcon
                      key={i}
                      instrument={i}
                      className="size-3.5"
                    />
                  ))}
                </p>
              ) : null}
            </div>
            <RsvpIcon status={a.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
