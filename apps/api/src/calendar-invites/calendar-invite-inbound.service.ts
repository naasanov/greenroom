import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  memberships,
  practiceOccurrenceOverrides,
  practiceSeries,
  users,
  type Database,
} from "@greenroom/db";
import type { EditScope, RsvpStatus } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { isRecurring } from "../events/occurrences.js";
import { PracticesService } from "../events/practices.service.js";
import { occurrencesBetween } from "../events/recurrence.js";
import { toOccurrenceKey } from "../events/time.js";
import {
  EMAIL,
  type EmailAdapter,
  type ReceivedEmail,
} from "../integrations/index.js";
import { CalendarInviteService } from "./calendar-invite.service.js";
import { parseReply, type ReplyPartstat } from "./ics-reply.js";
import {
  parseInviteToken,
  replyDomain,
  tokenFromAddress,
} from "./reply-token.js";

const DAY_MS = 86_400_000;
const PARTSTAT_STATUS: Record<ReplyPartstat, RsvpStatus> = {
  ACCEPTED: "going",
  TENTATIVE: "maybe",
  DECLINED: "not_going",
};

/** Plain address from `Name <a@b>` or `a@b`, lowercase. */
export const bareAddress = (s: string): string => {
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1]! : s).trim().toLowerCase();
};

/**
 * Turns an iMIP reply received at an `rsvp+<token>@domain` address into practice RSVPs.
 * Anything unrecognised is dropped silently (debug log only) so the endpoint leaks nothing.
 */
@Injectable()
export class CalendarInviteInboundService {
  private readonly log = new Logger(CalendarInviteInboundService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL) private readonly email: EmailAdapter,
    private readonly practices: PracticesService,
    private readonly invites: CalendarInviteService,
  ) {}

  /** Fetches the announced message and applies it. */
  async handleReceived(emailId: string): Promise<string> {
    const mail = await this.email.fetchReceivedEmail(emailId);
    if (!mail) return this.ignore("message not found");
    return this.handleReply(mail);
  }

  /** Applies a parsed inbound message; resolves to a short outcome used by tests and logs. */
  async handleReply(mail: ReceivedEmail): Promise<string> {
    if (mail.authFailed) return this.ignore("sender failed authentication");
    const token = mail.recipients
      .map((a) => tokenFromAddress(bareAddress(a)))
      .find((t): t is string => t != null);
    const parsed = token ? parseInviteToken(token) : null;
    if (!parsed) return this.ignore("no valid reply token");
    if (parsed.kind !== "series")
      return this.ignore("gig replies are not recorded");

    const [series] = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.id, parsed.eventId),
          isNull(practiceSeries.deletedAt),
        ),
      );
    if (!series) return this.ignore("series not found");

    const sender = bareAddress(mail.from);
    const members = await this.db
      .selectDistinct({ userId: users.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.bandId, series.bandId),
          isNull(memberships.leftAt),
          eq(users.isPlaceholder, false),
          or(
            eq(sql`lower(${users.email})`, sender),
            eq(sql`lower(${users.calendarEmail})`, sender),
          ),
        ),
      );
    if (members.length !== 1) return this.ignore("sender is not one member");
    const userId = members[0]!.userId;

    const uid = `series-${series.id}@${replyDomain()}`;
    const cancelledRows = await this.db
      .select({ at: practiceOccurrenceOverrides.originalStart })
      .from(practiceOccurrenceOverrides)
      .where(
        and(
          eq(practiceOccurrenceOverrides.seriesId, series.id),
          eq(practiceOccurrenceOverrides.cancelled, true),
        ),
      );
    const cancelled = new Set(cancelledRows.map((c) => c.at.getTime()));
    let applied = 0;
    for (const ics of mail.calendars) {
      const replies = parseReply(ics, series.timeZone) ?? [];
      for (const r of replies) {
        if (r.uid !== uid) continue;
        let original = r.recurrenceId;
        let scope: EditScope = r.thisAndFuture ? "this_and_following" : "this";
        if (!original) {
          // A master reply answers the whole series, anchored on its next occurrence.
          if (isRecurring(series)) {
            const now = new Date();
            original = occurrencesBetween(
              series,
              now,
              new Date(now.getTime() + 365 * DAY_MS),
            ).find((d) => !cancelled.has(d.getTime()));
            scope = "all";
          } else original = series.dtstart;
        }
        if (!original) continue;
        const when = original;
        try {
          await this.invites.withSilentReply(
            series.bandId,
            series.id,
            userId,
            async () => {
              await this.practices.setRsvp(
                series.bandId,
                userId,
                series.id,
                toOccurrenceKey(when),
                PARTSTAT_STATUS[r.partstat],
                scope,
              );
            },
          );
          applied++;
        } catch (err) {
          this.log.debug(
            `reply for ${series.id} not applied: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    return applied > 0
      ? `applied ${applied}`
      : this.ignore("no applicable reply");
  }

  private ignore(reason: string): string {
    this.log.debug(`inbound calendar mail ignored: ${reason}`);
    return `ignored: ${reason}`;
  }
}
