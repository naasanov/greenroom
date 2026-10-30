import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { PublicCalendar, PublicCalendarLink } from "@greenroom/shared";
import { Public } from "../auth/decorators.js";
import { BandAdmin, BandMember } from "../bands/index.js";
import { PublicCalendarService } from "./public-calendar.service.js";

@Controller("bands/:bandId/public-calendar")
export class PublicCalendarAdminController {
  constructor(private readonly calendar: PublicCalendarService) {}

  @BandMember()
  @Get()
  link(@Param("bandId") bandId: string): Promise<PublicCalendarLink> {
    return this.calendar.link(bandId);
  }

  @BandAdmin()
  @Post("reset")
  @HttpCode(200)
  reset(@Param("bandId") bandId: string): Promise<PublicCalendarLink> {
    return this.calendar.reset(bandId);
  }
}

/** Anonymous read; the token in the path is the only credential. */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("public/calendar/:token")
export class PublicCalendarController {
  constructor(private readonly calendar: PublicCalendarService) {}

  @Get()
  read(@Param("token") token: string): Promise<PublicCalendar> {
    return this.calendar.read(token);
  }
}
