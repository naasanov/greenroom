import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { SpotifyConnectModule } from "../spotify-connect/spotify-connect.module.js";
import { ExportService } from "./export.service.js";
import { ImportsService } from "./imports.service.js";
import { ReferenceSuggestionsService } from "./reference-suggestions.service.js";
import { YoutubeConnectModule } from "../youtube-connect/youtube-connect.module.js";
import { SmartAddService } from "./smart-add.service.js";
import { YoutubeExportService } from "./youtube-export.service.js";
import { SongsController } from "./songs.controller.js";
import { SongsService } from "./songs.service.js";

// JobsModule, DRIZZLE, and the integration adapters are global.
@Module({
  imports: [BandsModule, SpotifyConnectModule, YoutubeConnectModule],
  controllers: [SongsController],
  providers: [
    SongsService,
    SmartAddService,
    ImportsService,
    ExportService,
    YoutubeExportService,
    ReferenceSuggestionsService,
  ],
  exports: [SongsService, ExportService, YoutubeExportService],
})
export class SongsModule {}
