import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { LineupsController } from "./lineups.controller.js";
import { LineupsService } from "./lineups.service.js";

@Module({
  imports: [BandsModule],
  controllers: [LineupsController],
  providers: [LineupsService],
})
export class LineupsModule {}
