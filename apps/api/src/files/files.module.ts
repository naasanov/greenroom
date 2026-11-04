import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { MediaModule } from "../media/media.module.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";
import { GigFolderLinkService } from "./gig-folder-link.service.js";

// DRIZZLE and the integration adapters are global.
@Module({
  imports: [BandsModule, MediaModule],
  controllers: [FilesController],
  providers: [FilesService, GigFolderLinkService],
})
export class FilesModule {}
