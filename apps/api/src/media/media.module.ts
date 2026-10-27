import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { GoogleConnectModule } from "../google-connect/google-connect.module.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import { DriveController } from "./drive.controller.js";
import { DrivePollerService } from "./drive-poller.service.js";
import { DriveStructureService } from "./drive-structure.service.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";
import { MediaTestController } from "./media-test.controller.js";
import { ProfilePhotosController } from "./profile-photos.controller.js";
import { ProfilePhotosService } from "./profile-photos.service.js";

// JobsModule, DRIZZLE, and the integration adapters are global.
@Module({
  imports: [BandsModule, GoogleConnectModule],
  controllers: [
    DriveController,
    MediaController,
    ProfilePhotosController,
    ...(testingEnabled() ? [MediaTestController] : []),
  ],
  providers: [
    DriveStructureService,
    MediaService,
    DrivePollerService,
    ProfilePhotosService,
  ],
  exports: [DriveStructureService, MediaService, ProfilePhotosService],
})
export class MediaModule {}
