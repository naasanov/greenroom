import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { SpotifyConnectModule } from "../spotify-connect/spotify-connect.module.js";
import { ExportService } from "./export.service.js";
import { ImportsService } from "./imports.service.js";
import { SmartAddService } from "./smart-add.service.js";
import { SongsController } from "./songs.controller.js";
import { SongsService } from "./songs.service.js";

// JobsModule, DRIZZLE, and the integration adapters are global.
@Module({
  imports: [BandsModule, SpotifyConnectModule],
  controllers: [SongsController],
  providers: [SongsService, SmartAddService, ImportsService, ExportService],
  exports: [SongsService, ExportService],
})
export class SongsModule {}
