import { Module } from "@nestjs/common";
import { BandAdminGuard, BandMemberGuard } from "./band-access.js";
import {
  BandsController,
  InvitesController,
  MyCurrentBandController,
  MyInstrumentsController,
} from "./bands.controller.js";
import { BandsService } from "./bands.service.js";

@Module({
  controllers: [
    BandsController,
    InvitesController,
    MyCurrentBandController,
    MyInstrumentsController,
  ],
  providers: [BandsService, BandMemberGuard, BandAdminGuard],
  exports: [BandsService, BandMemberGuard, BandAdminGuard],
})
export class BandsModule {}
