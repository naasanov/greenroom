import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, between, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  gigLineup,
  gigs,
  memberships,
  practiceOccurrenceOverrides as overridesTable,
  practiceSeries,
  type Database,
} from "@greenroom/db";
import {
  MAX_EVENT_RANGE_DAYS,
  type CalendarEvent,
  type EventType,
  type GigEvent,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { expandSeries, type OverrideRow } from "./occurrences.js";
import { addDays, zonedInstant } from "./time.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type GigRow = typeof gigs.$inferSelect;

/** The span a gig occupies: its times, or the whole local date when untimed. */
function gigSpan(g: GigRow): { start: Date; end: Date } {
  if (g.startsAt && !g.allDay) {
    return { start: g.startsAt, end: g.endsAt ?? g.startsAt };
  }
  return {
    start: zonedInstant(g.date, "00:00", g.timeZone),
    end: zonedInstant(addDays(g.date, 1), "00:00", g.timeZone),
  };
}

const overlaps = (s: Date, e: Date, from: Date, to: Date): boolean =>
  s < to && (e > from || s >= from);

@Injectable()
export class EventsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Gigs and practice occurrences overlapping [from, to), time ordered. */
  async list(
    bandId: string,
    fromIso: string,
    toIso: string,
    type?: EventType,
  ): Promise<CalendarEvent[]> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!(from < to))
      throw new BadRequestException("`from` must be before `to`");
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_EVENT_RANGE_DAYS) {
      throw new BadRequestException(
        `Range cannot exceed ${MAX_EVENT_RANGE_DAYS} days`,
      );
    }
    const items: Array<{ sort: number; untimed: boolean; ev: CalendarEvent }> =
      [];

    if (type !== "practice") {
      const fromDate = addDays(from.toISOString().slice(0, 10), -2);
      const toDate = addDays(to.toISOString().slice(0, 10), 2);
      const rows = await this.db
        .select()
        .from(gigs)
        .where(
          and(
            eq(gigs.bandId, bandId),
            isNull(gigs.deletedAt),
            between(gigs.date, fromDate, toDate),
          ),
        );
      const inRange = rows.filter((g) => {
        const span = gigSpan(g);
        return overlaps(span.start, span.end, from, to);
      });
      const lineups = new Map<string, string[]>();
      if (inRange.length > 0) {
        const lineupRows = await this.db
          .select({ gigId: gigLineup.gigId, userId: memberships.userId })
          .from(gigLineup)
          .innerJoin(memberships, eq(memberships.id, gigLineup.membershipId))
          .where(
            inArray(
              gigLineup.gigId,
              inRange.map((g) => g.id),
            ),
          );
        for (const r of lineupRows) {
          const list = lineups.get(r.gigId) ?? [];
          if (!list.includes(r.userId)) list.push(r.userId);
          lineups.set(r.gigId, list);
        }
      }
      for (const g of inRange) {
        const span = gigSpan(g);
        const ev: GigEvent = {
          type: "gig",
          id: g.id,
          title: g.title,
          date: g.date,
          allDay: g.allDay,
          startsAt: g.startsAt?.toISOString() ?? null,
          endsAt: g.endsAt?.toISOString() ?? null,
          timeZone: g.timeZone,
          venueName: g.venueName,
          lineupUserIds: lineups.get(g.id) ?? [],
        };
        items.push({
          sort: span.start.getTime(),
          untimed: !g.startsAt || g.allDay,
          ev,
        });
      }
    }

    if (type !== "gig") {
      const series = await this.db
        .select()
        .from(practiceSeries)
        .where(
          and(
            eq(practiceSeries.bandId, bandId),
            isNull(practiceSeries.deletedAt),
            lte(practiceSeries.dtstart, to),
          ),
        );
      if (series.length > 0) {
        const lo = new Date(from.getTime() - DAY_MS);
        const overrides = await this.db
          .select()
          .from(overridesTable)
          .where(
            and(
              eq(overridesTable.bandId, bandId),
              or(
                between(overridesTable.originalStart, lo, to),
                between(overridesTable.startsAt, from, to),
              ),
            ),
          );
        const bySeries = new Map<string, OverrideRow[]>();
        for (const o of overrides) {
          const list = bySeries.get(o.seriesId) ?? [];
          list.push(o);
          bySeries.set(o.seriesId, list);
        }
        for (const s of series) {
          for (const ev of expandSeries(
            s,
            bySeries.get(s.id) ?? [],
            from,
            to,
          )) {
            items.push({
              sort: new Date(ev.startsAt).getTime(),
              untimed: false,
              ev,
            });
          }
        }
      }
    }

    items.sort(
      (a, b) =>
        a.sort - b.sort ||
        Number(b.untimed) - Number(a.untimed) ||
        a.ev.type.localeCompare(b.ev.type) ||
        a.ev.id.localeCompare(b.ev.id),
    );
    return items.map((i) => i.ev);
  }
}
