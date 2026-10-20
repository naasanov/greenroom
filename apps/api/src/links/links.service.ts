import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  gigs,
  memberships,
  practiceOccurrenceOverrides,
  practiceSeries,
  songs,
  type Database,
} from "@greenroom/db";
import type { GigLink, PracticeLink, SongLink } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { expandSeries } from "../events/occurrences.js";
import { addDays, zonedInstant } from "../events/time.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const notFound = (): NotFoundException => new NotFoundException("Not found");

/** Resolves a resource id to its band for callers who are active members of it. */
@Injectable()
export class LinksService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async assertMember(userId: string, bandId: string): Promise<void> {
    const [m] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    if (!m) throw notFound();
  }

  async gig(userId: string, gigId: string): Promise<GigLink> {
    if (!UUID_RE.test(gigId)) throw notFound();
    const [row] = await this.db
      .select({ bandId: gigs.bandId })
      .from(gigs)
      .where(and(eq(gigs.id, gigId), isNull(gigs.deletedAt)));
    if (!row) throw notFound();
    await this.assertMember(userId, row.bandId);
    return { bandId: row.bandId, gigId };
  }

  async song(userId: string, songId: string): Promise<SongLink> {
    if (!UUID_RE.test(songId)) throw notFound();
    const [row] = await this.db
      .select({ bandId: songs.bandId })
      .from(songs)
      .where(and(eq(songs.id, songId), isNull(songs.deletedAt)));
    if (!row) throw notFound();
    await this.assertMember(userId, row.bandId);
    return { bandId: row.bandId, songId };
  }

  async practice(
    userId: string,
    seriesId: string,
    date: unknown,
  ): Promise<PracticeLink> {
    if (!UUID_RE.test(seriesId)) throw notFound();
    const [series] = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(eq(practiceSeries.id, seriesId), isNull(practiceSeries.deletedAt)),
      );
    if (!series) throw notFound();
    await this.assertMember(userId, series.bandId);
    const base = { bandId: series.bandId, seriesId };
    if (typeof date !== "string" || !validDate(date)) {
      return { ...base, occurrenceKey: null };
    }
    const overrides = await this.db
      .select()
      .from(practiceOccurrenceOverrides)
      .where(eq(practiceOccurrenceOverrides.seriesId, seriesId));
    const from = zonedInstant(date, "00:00", series.timeZone);
    const to = zonedInstant(addDays(date, 1), "00:00", series.timeZone);
    const hit = expandSeries(series, overrides, from, to).find(
      (ev) => ev.date === date,
    );
    return { ...base, occurrenceKey: hit?.occurrenceKey ?? null };
  }
}

function validDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  return !Number.isNaN(Date.parse(date)) && addDays(date, 0) === date;
}
