import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { Inject } from "@nestjs/common";
import {
  memberships,
  practiceOccurrenceOverrides,
  practiceSeries,
  type Database,
} from "@greenroom/db";
import type { RsvpStatus } from "@greenroom/shared";
import { Public } from "../auth/decorators.js";
import { webUrl } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import { isRecurring } from "../events/occurrences.js";
import { PracticesService } from "../events/practices.service.js";
import { occurrencesBetween } from "../events/recurrence.js";
import { toOccurrenceKey } from "../events/time.js";
import { CalendarInviteInboundService } from "./calendar-invite-inbound.service.js";
import { RSVP_LINK_RESPONSES, verifyRsvpToken } from "./rsvp-link.js";
import { verifySvix } from "./svix.js";

/** Resend inbound webhook. Authorized only by the Svix signature over the raw body. */
@Public()
@Controller("webhooks/resend")
export class ResendInboundController {
  constructor(private readonly inbound: CalendarInviteInboundService) {}

  @Post("inbound")
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: { type?: unknown; data?: { email_id?: unknown } },
    @Headers("svix-id") id?: string,
    @Headers("svix-timestamp") timestamp?: string,
    @Headers("svix-signature") signature?: string,
  ): Promise<{ ok: true }> {
    const valid = verifySvix(process.env.RESEND_WEBHOOK_SECRET, req.rawBody, {
      id,
      timestamp,
      signature,
    });
    if (!valid) throw new UnauthorizedException("Invalid signature");
    const emailId = body?.data?.email_id;
    if (body?.type === "email.received" && typeof emailId === "string") {
      await this.inbound.handleReceived(emailId);
    }
    return { ok: true };
  }
}

const ANSWER: Record<(typeof RSVP_LINK_RESPONSES)[number], RsvpStatus> = {
  going: "going",
  maybe: "maybe",
  no: "not_going",
};
const LABEL: Record<RsvpStatus, string> = {
  going: "You are going",
  maybe: "You are marked as maybe",
  not_going: "You are not going",
  no_response: "Answer cleared",
};

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function page(
  res: Response,
  status: number,
  heading: string,
  detail: string,
  link?: string,
): void {
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    })
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Greenroom RSVP</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.4rem">${esc(heading)}</h1><p>${esc(detail)}</p>` +
        (link ? `<p><a href="${esc(link)}">Open in Greenroom</a></p>` : "") +
        `</body></html>`,
    );
}

/** One-click RSVP from the invite email. The signed token is the only credential. */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("public/rsvp")
export class RsvpLinkController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly practices: PracticesService,
  ) {}

  @Get(":token")
  async answer(
    @Param("token") token: string,
    @Query("response") response: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const claims = verifyRsvpToken(token);
    const answer = ANSWER[response as keyof typeof ANSWER];
    if (!claims || !answer) {
      return page(
        res,
        400,
        "This link is not valid",
        "Open Greenroom to answer.",
        webUrl(),
      );
    }
    if (claims.exp * 1000 < Date.now()) {
      return page(
        res,
        410,
        "This link has expired",
        "Open Greenroom to answer.",
        webUrl(),
      );
    }
    const [row] = await this.db
      .select({ series: practiceSeries })
      .from(practiceSeries)
      .innerJoin(
        memberships,
        and(
          eq(memberships.bandId, practiceSeries.bandId),
          eq(memberships.userId, claims.userId),
          isNull(memberships.leftAt),
        ),
      )
      .where(
        and(
          eq(practiceSeries.id, claims.seriesId),
          isNull(practiceSeries.deletedAt),
        ),
      );
    if (!row) {
      return page(
        res,
        404,
        "This practice is no longer available",
        "Open Greenroom to see your events.",
        webUrl(),
      );
    }
    const series = row.series;
    let original: Date | undefined;
    let scope: "this" | "all" = "this";
    if (claims.occurrence) {
      original = new Date(
        claims.occurrence.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
          "$1-$2-$3T$4:$5:$6Z",
        ),
      );
    } else if (isRecurring(series)) {
      const cancelled = new Set(
        (
          await this.db
            .select({ at: practiceOccurrenceOverrides.originalStart })
            .from(practiceOccurrenceOverrides)
            .where(
              and(
                eq(practiceOccurrenceOverrides.seriesId, series.id),
                eq(practiceOccurrenceOverrides.cancelled, true),
              ),
            )
        ).map((c) => c.at.getTime()),
      );
      const now = new Date();
      original = occurrencesBetween(
        series,
        now,
        new Date(now.getTime() + 365 * 86_400_000),
      ).find((d) => !cancelled.has(d.getTime()));
      scope = "all";
    } else original = series.dtstart;
    if (!original || Number.isNaN(original.getTime())) {
      return page(
        res,
        404,
        "No upcoming practice",
        "Open Greenroom to see your events.",
        webUrl(),
      );
    }
    try {
      await this.practices.setRsvp(
        series.bandId,
        claims.userId,
        series.id,
        toOccurrenceKey(original),
        answer,
        scope,
      );
    } catch {
      return page(
        res,
        404,
        "This practice is no longer available",
        "Open Greenroom to see your events.",
        webUrl(),
      );
    }
    page(
      res,
      200,
      LABEL[answer],
      `${series.title}: your answer is saved${scope === "all" ? " for the whole series" : ""}.`,
      `${webUrl()}/practices/${series.id}`,
    );
  }
}
