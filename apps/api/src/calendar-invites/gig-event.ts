import type { gigs } from "@greenroom/db";
import { gigSlugId } from "@greenroom/shared";
import { addDays, localTime } from "../events/time.js";

type GigRow = typeof gigs.$inferSelect;

const MINUTE_MS = 60_000;
/** Length used for timed gigs that have a start but no end. */
const DEFAULT_GIG_MINUTES = 120;

export interface GigEventContent {
  summary: string;
  description: string;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
}

/** Venue name and address joined as a single location string. */
function gigLocation(g: {
  venueName: string | null;
  address: string | null;
}): string | null {
  const parts = [g.venueName, g.address].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Event times for a gig; all-day uses an exclusive end date. */
function gigTimes(g: GigRow): { allDay: boolean; start: string; end: string } {
  if (g.allDay || !g.startsAt) {
    return { allDay: true, start: g.date, end: addDays(g.date, 1) };
  }
  const end =
    g.endsAt ??
    new Date(g.startsAt.getTime() + DEFAULT_GIG_MINUTES * MINUTE_MS);
  return {
    allDay: false,
    start: g.startsAt.toISOString(),
    end: end.toISOString(),
  };
}

export function gigInput(g: GigRow, webUrl: string): GigEventContent {
  const t = gigTimes(g);
  const lines = [g.notes?.trim() || null];
  if (g.loadInAt) lines.push(`Load-in: ${localTime(g.loadInAt, g.timeZone)}`);
  lines.push(`${webUrl}/gigs/${gigSlugId(g)}`);
  return {
    summary: g.title,
    description: lines.filter((l): l is string => !!l).join("\n\n"),
    location: gigLocation(g),
    start: t.start,
    end: t.end,
    allDay: t.allDay,
    timeZone: g.timeZone,
  };
}
