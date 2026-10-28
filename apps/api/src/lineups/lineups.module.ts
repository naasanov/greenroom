import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import {
  LineupHistoryController,
  LineupsController,
} from "./lineups.controller.js";
import { LineupsService } from "./lineups.service.js";

@Module({
  imports: [BandsModule],
  controllers: [LineupsController, LineupHistoryController],
  providers: [LineupsService],
})
export class LineupsModule {}
