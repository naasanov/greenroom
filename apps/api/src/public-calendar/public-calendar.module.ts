import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { BandsModule } from "../bands/bands.module.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import {
  PublicCalendarAdminController,
  PublicCalendarController,
} from "./public-calendar.controller.js";
import { PublicCalendarService } from "./public-calendar.service.js";

const envInt = (name: string, dflt: number) => () =>
  Number(process.env[name]) || dflt;
// Fake-mode tests send x-test-ip so each test gets its own per-IP bucket.
const clientIp = (req: Request): string =>
  (testingEnabled() && String(req.headers["x-test-ip"] ?? "")) ||
  String(req.ip);

@Module({
  imports: [
    BandsModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "calendar-ip",
          ttl: 60_000,
          limit: envInt("PUBLIC_CALENDAR_REQUESTS_PER_MINUTE", 60),
          getTracker: (req: Record<string, unknown>) =>
            clientIp(req as unknown as Request),
        },
      ],
    }),
  ],
  controllers: [PublicCalendarAdminController, PublicCalendarController],
  providers: [PublicCalendarService],
})
export class PublicCalendarModule {}
