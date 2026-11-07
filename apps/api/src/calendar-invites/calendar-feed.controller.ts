import { createHash, randomBytes } from "node:crypto";
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { memberships, type Database } from "@greenroom/db";
import { Public } from "../auth/decorators.js";
import { apiPublicUrl } from "../auth/auth.constants.js";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { DRIZZLE } from "../db/db.constants.js";
import { CalendarInviteService } from "./calendar-invite.service.js";

export interface CalendarFeedLink {
  /** https URL of the .ics feed. */
  url: string;
  /** Same feed with the webcal scheme, which opens calendar apps directly. */
  webcalUrl: string;
}

const linkFor = (token: string): CalendarFeedLink => {
  const url = `${apiPublicUrl()}/public/calendar-feed/${token}.ics`;
  return { url, webcalUrl: url.replace(/^https?:/, "webcal:") };
};

/** The signed-in member's own feed URL and its rotation. */
@Controller("bands/:bandId/calendar-feed")
export class CalendarFeedLinkController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @BandMember()
  @Get()
  async link(
    @CurrentMembership() m: BandMembership,
  ): Promise<CalendarFeedLink> {
    const [row] = await this.db
      .select({ token: memberships.calendarFeedToken })
      .from(memberships)
      .where(eq(memberships.id, m.id));
    if (!row) throw new NotFoundException("Membership not found");
    return linkFor(row.token);
  }

  /** Writing a new token makes the old URL stop resolving. */
  @BandMember()
  @Post("rotate")
  @HttpCode(200)
  async rotate(
    @CurrentMembership() m: BandMembership,
  ): Promise<CalendarFeedLink> {
    const [row] = await this.db
      .update(memberships)
      .set({ calendarFeedToken: randomBytes(32).toString("hex") })
      .where(eq(memberships.id, m.id))
      .returning({ token: memberships.calendarFeedToken });
    if (!row) throw new NotFoundException("Membership not found");
    return linkFor(row.token);
  }
}

@Injectable()
export class CalendarFeedService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly invites: CalendarInviteService,
  ) {}

  /** The feed text for a token, or null when it names no active member. */
  async read(token: string): Promise<string | null> {
    if (!/^[0-9a-f]{32,128}$/.test(token)) return null;
    const [m] = await this.db
      .select({ bandId: memberships.bandId, userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.calendarFeedToken, token),
          isNull(memberships.leftAt),
        ),
      );
    return m ? this.invites.feed(m.bandId, m.userId) : null;
  }
}

/** Anonymous subscription feed; the secret token in the path is the only credential. */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("public/calendar-feed")
export class CalendarFeedController {
  constructor(private readonly feed: CalendarFeedService) {}

  @Get(":file")
  async read(
    @Param("file") file: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const text = file.endsWith(".ics")
      ? await this.feed.read(file.slice(0, -4))
      : null;
    if (text == null)
      throw new NotFoundException("This calendar is not available");
    const etag = `"${createHash("sha1").update(text).digest("hex")}"`;
    res.set({
      "Cache-Control": "private, max-age=300, must-revalidate",
      ETag: etag,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    });
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
    res
      .type("text/calendar; charset=utf-8")
      .set("Content-Disposition", 'inline; filename="greenroom.ics"')
      .send(text);
  }
}
