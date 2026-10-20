import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  createBandSchema,
  leaveBandSchema,
  setInstrumentsSchema,
  updateBandSchema,
  updateMemberRoleSchema,
  type BandDetail,
  type BandMember,
  type BandSummary,
  type CreateBand,
  type InviteLinkInfo,
  type InvitePreview,
  type LeaveBand,
  type MyInstruments,
  type SetInstruments,
  type UpdateBand,
  type UpdateMemberRole,
  type User,
} from "@greenroom/shared";
import { CurrentUser, Public } from "../auth/decorators.js";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  BandAdmin,
  BandMember as BandMemberGuard,
  CurrentMembership,
  type BandMembership,
} from "./band-access.js";
import { BandsService } from "./bands.service.js";

@Controller("bands")
export class BandsController {
  constructor(private readonly bands: BandsService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodPipe(createBandSchema)) body: CreateBand,
  ): Promise<BandSummary> {
    return this.bands.create(user.id, body.name);
  }

  @Get()
  list(@CurrentUser() user: User): Promise<BandSummary[]> {
    return this.bands.listForUser(user.id);
  }

  @BandMemberGuard()
  @Get(":bandId")
  detail(@CurrentMembership() m: BandMembership): Promise<BandDetail> {
    return this.bands.detail(m.bandId, m.role);
  }

  @BandAdmin()
  @Patch(":bandId")
  update(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(updateBandSchema)) body: UpdateBand,
  ): Promise<BandDetail> {
    return this.bands.update(m.bandId, m.role, body);
  }

  @BandMemberGuard()
  @Get(":bandId/members")
  members(@CurrentMembership() m: BandMembership): Promise<BandMember[]> {
    return this.bands.members(m.bandId);
  }

  @BandAdmin()
  @Patch(":bandId/members/:userId")
  @HttpCode(204)
  async setRole(
    @CurrentMembership() m: BandMembership,
    @Param("userId") userId: string,
    @Body(new ZodPipe(updateMemberRoleSchema)) body: UpdateMemberRole,
  ): Promise<void> {
    await this.bands.setRole(m.bandId, userId, body.role);
  }

  @BandAdmin()
  @Delete(":bandId/members/:userId")
  @HttpCode(204)
  async removeMember(
    @CurrentMembership() m: BandMembership,
    @Param("userId") userId: string,
  ): Promise<void> {
    await this.bands.removeMember(m.bandId, userId);
  }

  @BandMemberGuard()
  @Post(":bandId/leave")
  @HttpCode(204)
  async leave(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(leaveBandSchema)) body: LeaveBand,
  ): Promise<void> {
    await this.bands.leave(m.bandId, m.userId, body.deleteBand === true);
  }

  @BandMemberGuard()
  @Get(":bandId/invite")
  invite(@CurrentMembership() m: BandMembership): Promise<InviteLinkInfo> {
    return this.bands.getOrCreateInvite(m.bandId, m.userId);
  }

  @BandAdmin()
  @Post(":bandId/invite/reset")
  @HttpCode(200)
  resetInvite(@CurrentMembership() m: BandMembership): Promise<InviteLinkInfo> {
    return this.bands.resetInvite(m.bandId, m.userId);
  }
}

@Controller("invites")
export class InvitesController {
  constructor(private readonly bands: BandsService) {}

  @Public()
  @Get(":token")
  preview(@Param("token") token: string): Promise<InvitePreview> {
    return this.bands.previewInvite(token);
  }

  @Post(":token/accept")
  @HttpCode(200)
  accept(
    @Param("token") token: string,
    @CurrentUser() user: User,
  ): Promise<BandSummary> {
    return this.bands.acceptInvite(token, user.id);
  }
}

@Controller("me/instruments")
export class MyInstrumentsController {
  constructor(private readonly bands: BandsService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<MyInstruments> {
    return this.bands.getInstruments(user.id);
  }

  @Put()
  put(
    @CurrentUser() user: User,
    @Body(new ZodPipe(setInstrumentsSchema)) body: SetInstruments,
  ): Promise<MyInstruments> {
    return this.bands.setInstruments(user.id, body);
  }
}
