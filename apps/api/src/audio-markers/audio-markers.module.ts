import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { FilesModule } from "../files/files.module.js";
import { AudioMarkersController } from "./audio-markers.controller.js";
import { AudioMarkersService } from "./audio-markers.service.js";

// DRIZZLE and the integration adapters are global.
@Module({
  imports: [BandsModule, FilesModule],
  controllers: [AudioMarkersController],
  providers: [AudioMarkersService],
})
export class AudioMarkersModule {}
