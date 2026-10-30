import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  GOOGLE_CALENDAR,
  type GoogleCalendarAdapter,
} from "../integrations/index.js";
import type { BandSyncContext } from "./calendar-sync.context.js";

/**
 * Keeps the band calendar's reader rules equal to the active members' calendar
 * addresses. The service account keeps its owner rule; other roles are left alone.
 */
@Injectable()
export class CalendarAclService {
  private readonly log = new Logger(CalendarAclService.name);

  constructor(
    @Inject(GOOGLE_CALENDAR) private readonly calendar: GoogleCalendarAdapter,
  ) {}

  /** Idempotent: shares missing members, unshares readers who are no longer members. */
  async reconcile(ctx: BandSyncContext): Promise<void> {
    const wanted = new Map(ctx.emails.map((e) => [e.toLowerCase(), e]));
    const rules = await this.calendar.listAclRules(
      ctx.accessToken,
      ctx.calendarId,
    );
    const have = new Set(rules.map((r) => r.email.toLowerCase()));

    for (const rule of rules) {
      if (rule.role !== "reader" || wanted.has(rule.email.toLowerCase())) {
        continue;
      }
      await this.calendar.deleteAclRule(
        ctx.accessToken,
        ctx.calendarId,
        rule.id,
      );
    }
    for (const [key, email] of wanted) {
      if (have.has(key)) continue;
      const res = await this.calendar.shareCalendar(
        ctx.accessToken,
        ctx.calendarId,
        email,
      );
      if (res.status === "rejected") {
        // Not a Google account (or malformed); the member simply gets no share.
        this.log.warn(`calendar share skipped for band ${ctx.bandId}`);
      }
    }
  }
}
