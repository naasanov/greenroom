import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  calendarSetupSchema,
  type CalendarSetup,
  type CalendarSetupResult,
  type CalendarSyncStatus,
} from "@greenroom/shared";
import { BandMember } from "../bands/band-access.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CalendarSyncService } from "./calendar-sync.service.js";

@Controller("bands/:bandId/integrations/google/calendar")
export class CalendarSyncController {
  constructor(private readonly sync: CalendarSyncService) {}

  /** Creates the band calendar if needed and pushes all events. 409 CALENDAR_BOT_NOT_CONFIGURED when the service account key is missing. */
  @BandMember()
  @Post("setup")
  @HttpCode(200)
  setup(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(calendarSetupSchema)) body: CalendarSetup,
  ): Promise<CalendarSetupResult> {
    return this.sync.setup(bandId, body.timeZone);
  }

  @BandMember()
  @Get("sync")
  status(@Param("bandId") bandId: string): Promise<CalendarSyncStatus> {
    return this.sync.status(bandId);
  }
}
