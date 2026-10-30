import { randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { bands, gigs, type Database } from "@greenroom/db";
import {
  PUBLIC_SOCIAL_KEYS,
  type PublicCalendar,
  type PublicCalendarLink,
} from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import { localTime } from "../events/time.js";

const MAX_GIGS = 200;

/** Admin link management and the anonymous, whitelist-only calendar read. */
@Injectable()
export class PublicCalendarService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private toLink(token: string): PublicCalendarLink {
    return { token, url: `${webUrl()}/c/${token}` };
  }

  async link(bandId: string): Promise<PublicCalendarLink> {
    const [band] = await this.db
      .select({ token: bands.publicCalendarToken })
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band) throw new NotFoundException("Band not found");
    return this.toLink(band.token);
  }

  /** Writing a new token makes the old URL stop resolving. */
  async reset(bandId: string): Promise<PublicCalendarLink> {
    const [band] = await this.db
      .update(bands)
      .set({ publicCalendarToken: randomBytes(24).toString("base64url") })
      .where(eq(bands.id, bandId))
      .returning({ token: bands.publicCalendarToken });
    if (!band) throw new NotFoundException("Band not found");
    return this.toLink(band.token);
  }

  async read(token: string): Promise<PublicCalendar> {
    if (token.length < 20 || token.length > 128) throw this.notFound();
    const [band] = await this.db
      .select({
        id: bands.id,
        name: bands.name,
        photoUrl: bands.photoUrl,
        bio: bands.bio,
        socialLinks: bands.socialLinks,
        bookingContact: bands.bookingContact,
      })
      .from(bands)
      .where(eq(bands.publicCalendarToken, token));
    if (!band) throw this.notFound();
    const today = new Date().toISOString().slice(0, 10);
    // Explicit column list: nothing else of a gig can reach the response.
    const rows = await this.db
      .select({
        title: gigs.title,
        date: gigs.date,
        startsAt: gigs.startsAt,
        timeZone: gigs.timeZone,
        venueName: gigs.venueName,
      })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, band.id),
          eq(gigs.showOnPublicCalendar, true),
          isNull(gigs.deletedAt),
          gte(gigs.date, today),
        ),
      )
      .orderBy(asc(gigs.date), asc(gigs.startsAt))
      .limit(MAX_GIGS);
    const socialLinks: Record<string, string> = {};
    for (const k of PUBLIC_SOCIAL_KEYS) {
      const v = band.socialLinks[k];
      if (v) socialLinks[k] = v;
    }
    return {
      bandName: band.name,
      photoUrl: band.photoUrl,
      bio: band.bio,
      socialLinks,
      bookingEmail: band.bookingContact,
      gigs: rows.map((r) => ({
        title: r.title,
        date: r.date,
        startTime: r.startsAt ? localTime(r.startsAt, r.timeZone) : null,
        venueName: r.venueName,
      })),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException("This calendar is not available");
  }
}
