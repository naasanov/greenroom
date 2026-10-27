import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { gigLineup, gigs, memberships, type Database } from "@greenroom/db";
import type { CreateGig, Gig, UpdateGig } from "@greenroom/shared";
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { DRIZZLE } from "../db/db.constants.js";
import { addDays, isValidTimeZone, localTime, zonedInstant } from "./time.js";

type GigRow = typeof gigs.$inferSelect;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The editable gig fields in their local-time (form) representation. */
type GigForm = Omit<CreateGig, "allDay" | "showOnPublicCalendar"> & {
  allDay: boolean;
  showOnPublicCalendar: boolean;
};

export function toGig(g: GigRow): Gig {
  const tz = g.timeZone;
  return {
    id: g.id,
    bandId: g.bandId,
    title: g.title,
    date: g.date,
    allDay: g.allDay,
    startTime: g.startsAt ? localTime(g.startsAt, tz) : null,
    endTime: g.endsAt ? localTime(g.endsAt, tz) : null,
    loadInTime: g.loadInAt ? localTime(g.loadInAt, tz) : null,
    startsAt: g.startsAt?.toISOString() ?? null,
    endsAt: g.endsAt?.toISOString() ?? null,
    loadInAt: g.loadInAt?.toISOString() ?? null,
    timeZone: tz,
    venueName: g.venueName,
    address: g.address,
    googlePlaceId: g.googlePlaceId,
    lat: g.lat,
    lng: g.lng,
    contactName: g.contactName,
    contactPhone: g.contactPhone,
    contactEmail: g.contactEmail,
    notes: g.notes,
    showOnPublicCalendar: g.showOnPublicCalendar,
    driveFolderId: g.driveFolderId,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

/** Local fields to column values; end rolls to the next day when it is not after the start. */
function toColumns(f: GigForm) {
  if (!isValidTimeZone(f.timeZone ?? "UTC")) {
    throw new BadRequestException("Unknown time zone");
  }
  const tz = f.timeZone ?? "UTC";
  if (f.allDay && (f.startTime || f.endTime || f.loadInTime)) {
    throw new BadRequestException("All-day gigs cannot have times");
  }
  if (f.endTime && !f.startTime) {
    throw new BadRequestException("endTime requires startTime");
  }
  const startsAt = f.startTime ? zonedInstant(f.date, f.startTime, tz) : null;
  let endsAt: Date | null = null;
  if (startsAt && f.endTime) {
    endsAt = zonedInstant(f.date, f.endTime, tz);
    if (endsAt <= startsAt)
      endsAt = zonedInstant(addDays(f.date, 1), f.endTime, tz);
  }
  const loadInAt = f.loadInTime ? zonedInstant(f.date, f.loadInTime, tz) : null;
  return {
    title: f.title,
    date: f.date,
    allDay: f.allDay,
    startsAt,
    endsAt,
    loadInAt,
    timeZone: tz,
    venueName: f.venueName ?? null,
    address: f.address ?? null,
    googlePlaceId: f.googlePlaceId ?? null,
    lat: f.lat ?? null,
    lng: f.lng ?? null,
    contactName: f.contactName ?? null,
    contactPhone: f.contactPhone ?? null,
    contactEmail: f.contactEmail ?? null,
    notes: f.notes ?? null,
    showOnPublicCalendar: f.showOnPublicCalendar,
  };
}

function formOf(g: GigRow): GigForm {
  const v = toGig(g);
  return {
    title: v.title,
    date: v.date,
    allDay: v.allDay,
    startTime: v.startTime,
    endTime: v.endTime,
    loadInTime: v.loadInTime,
    timeZone: v.timeZone,
    venueName: v.venueName,
    address: v.address,
    googlePlaceId: v.googlePlaceId,
    lat: v.lat,
    lng: v.lng,
    contactName: v.contactName,
    contactPhone: v.contactPhone,
    contactEmail: v.contactEmail,
    notes: v.notes,
    showOnPublicCalendar: v.showOnPublicCalendar,
  };
}

@Injectable()
export class GigsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly calendarSync: CalendarSyncQueue,
  ) {}

  private async find(bandId: string, gigId: string): Promise<GigRow> {
    if (!UUID_RE.test(gigId)) throw new NotFoundException("Gig not found");
    const [row] = await this.db
      .select()
      .from(gigs)
      .where(
        and(
          eq(gigs.id, gigId),
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException("Gig not found");
    return row;
  }

  async create(bandId: string, userId: string, body: CreateGig): Promise<Gig> {
    const cols = toColumns({
      ...body,
      allDay: body.allDay ?? false,
      showOnPublicCalendar: body.showOnPublicCalendar ?? true,
    });
    const row = await this.db.transaction(async (tx) => {
      const [gig] = await tx
        .insert(gigs)
        .values({ ...cols, bandId, createdByUserId: userId })
        .returning();
      // New gigs start with the full band in the lineup.
      const active = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.bandId, bandId), isNull(memberships.leftAt)));
      if (active.length > 0) {
        await tx
          .insert(gigLineup)
          .values(
            active.map((m) => ({ bandId, gigId: gig!.id, membershipId: m.id })),
          );
      }
      return gig!;
    });
    await this.calendarSync.gig(bandId, row.id);
    return toGig(row);
  }

  async get(bandId: string, gigId: string): Promise<Gig> {
    return toGig(await this.find(bandId, gigId));
  }

  async update(bandId: string, gigId: string, patch: UpdateGig): Promise<Gig> {
    const existing = await this.find(bandId, gigId);
    const merged: GigForm = { ...formOf(existing), ...stripUndefined(patch) };
    // Turning all-day on without naming times clears them.
    if (patch.allDay === true) {
      if (patch.startTime === undefined) merged.startTime = null;
      if (patch.endTime === undefined) merged.endTime = null;
      if (patch.loadInTime === undefined) merged.loadInTime = null;
    }
    // Clearing the start clears the end with it.
    if (patch.startTime === null && patch.endTime === undefined) {
      merged.endTime = null;
    }
    const [row] = await this.db
      .update(gigs)
      .set(toColumns(merged))
      .where(eq(gigs.id, gigId))
      .returning();
    await this.calendarSync.gig(bandId, gigId);
    return toGig(row!);
  }

  /** Soft delete. Drive media for the gig is deliberately left alone. */
  async remove(bandId: string, gigId: string): Promise<void> {
    await this.find(bandId, gigId);
    await this.db
      .update(gigs)
      .set({ deletedAt: new Date() })
      .where(eq(gigs.id, gigId));
    await this.calendarSync.gig(bandId, gigId);
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
