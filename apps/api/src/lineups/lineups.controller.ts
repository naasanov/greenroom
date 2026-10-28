import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  copyLineupSchema,
  lineupHistoryQuerySchema,
  replaceLineupSchema,
  type CopyLineup,
  type Lineup,
  type LineupCopyResult,
  type LineupHistoryEntry,
  type LineupHistoryQuery,
  type ReplaceLineup,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { LineupsService } from "./lineups.service.js";

@BandMember()
@Controller("bands/:bandId/lineups")
export class LineupHistoryController {
  constructor(private readonly lineups: LineupsService) {}

  @Get("history")
  history(
    @CurrentMembership() m: BandMembership,
    @Query(new ZodPipe(lineupHistoryQuerySchema)) query: LineupHistoryQuery,
  ): Promise<LineupHistoryEntry[]> {
    return this.lineups.history(m.bandId, query);
  }
}

// Every member can edit any gig's lineup; the design has no admin-only part.
@BandMember()
@Controller("bands/:bandId/gigs/:gigId/lineup")
export class LineupsController {
  constructor(private readonly lineups: LineupsService) {}

  @Get()
  get(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
  ): Promise<Lineup> {
    return this.lineups.get(m.bandId, gigId);
  }

  @Put()
  replace(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
    @Body(new ZodPipe(replaceLineupSchema)) body: ReplaceLineup,
  ): Promise<Lineup> {
    return this.lineups.replace(m.bandId, gigId, body.membershipIds);
  }

  @Post("copy-from-last")
  @HttpCode(200)
  copyFromLast(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
  ): Promise<LineupCopyResult> {
    return this.lineups.copyFromLast(m.bandId, gigId);
  }

  @Post("copy")
  @HttpCode(200)
  copy(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
    @Body(new ZodPipe(copyLineupSchema)) body: CopyLineup,
  ): Promise<Lineup> {
    return this.lineups.copy(m.bandId, gigId, body.sourceGigId);
  }
}
