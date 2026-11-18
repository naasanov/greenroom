import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { ChordsController } from "./chords.controller.js";
import { ChordsService } from "./chords.service.js";

// DRIZZLE and the integration adapters are global.
@Module({
  imports: [BandsModule],
  controllers: [ChordsController],
  providers: [ChordsService],
})
export class ChordsModule {}
