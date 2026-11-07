import { Global, Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { BandsModule } from "../bands/bands.module.js";
import { PracticesService } from "../events/practices.service.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import {
  CalendarFeedController,
  CalendarFeedLinkController,
  CalendarFeedService,
} from "./calendar-feed.controller.js";
import { CalendarInviteInboundService } from "./calendar-invite-inbound.service.js";
import {
  ResendInboundController,
  RsvpLinkController,
} from "./calendar-invite-public.controller.js";
import { CalendarInviteQueue } from "./calendar-invite.queue.js";
import { CalendarInviteService } from "./calendar-invite.service.js";
import { CalendarInviteWorker } from "./calendar-invite.worker.js";

// Fake-mode tests send x-test-ip so each test gets its own per-IP bucket.
const clientIp = (req: Request): string =>
  (testingEnabled() && String(req.headers["x-test-ip"] ?? "")) ||
  String(req.ip);

// Global so the events, bands, account and auth services can enqueue without importing this module.
@Global()
@Module({
  imports: [
    BandsModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "calendar-invite-ip",
          ttl: 60_000,
          limit: Number(process.env.PUBLIC_CALENDAR_REQUESTS_PER_MINUTE) || 60,
          getTracker: (req: Record<string, unknown>) =>
            clientIp(req as unknown as Request),
        },
      ],
    }),
  ],
  controllers: [
    ResendInboundController,
    RsvpLinkController,
    CalendarFeedLinkController,
    CalendarFeedController,
  ],
  providers: [
    CalendarInviteQueue,
    CalendarInviteService,
    CalendarInviteWorker,
    CalendarInviteInboundService,
    CalendarFeedService,
    // Stateless; a second instance here keeps the events module untouched.
    PracticesService,
  ],
  exports: [
    CalendarInviteQueue,
    CalendarInviteService,
    CalendarInviteInboundService,
  ],
})
export class CalendarInviteModule {}
