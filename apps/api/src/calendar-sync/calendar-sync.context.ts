import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, memberships, users, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import { attendeeEmails, type SyncMember } from "./calendar-sync.mapping.js";

/** Everything a sync step needs about one linked, set-up band. */
export interface BandSyncContext {
  bandId: string;
  calendarId: string;
  accessToken: string;
  members: SyncMember[];
  /** Invite addresses of the active members, deduplicated. */
  emails: string[];
}

@Injectable()
export class SyncContextService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly links: GoogleLinksService,
  ) {}

  /** Null when the band has no calendar yet or its Google link is gone. */
  async get(bandId: string): Promise<BandSyncContext | null> {
    const [band] = await this.db
      .select({ calendarId: bands.calendarId })
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band?.calendarId) return null;
    const accessToken = await this.links.getAccessToken(bandId, "calendar");
    if (!accessToken) return null;
    const members = await this.members(bandId);
    return {
      bandId,
      calendarId: band.calendarId,
      accessToken,
      members,
      emails: attendeeEmails(members),
    };
  }

  async members(bandId: string): Promise<SyncMember[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        calendarEmail: users.calendarEmail,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.bandId, bandId), isNull(memberships.leftAt)))
      .orderBy(memberships.joinedAt, users.id);
    return rows.map((r) => ({
      userId: r.userId,
      email: r.calendarEmail ?? r.email,
    }));
  }
}
