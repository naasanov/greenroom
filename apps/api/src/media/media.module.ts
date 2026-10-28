import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { BandsModule } from "../bands/bands.module.js";
import { GoogleConnectModule } from "../google-connect/google-connect.module.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import { DriveController } from "./drive.controller.js";
import { DrivePollerService } from "./drive-poller.service.js";
import { DriveStructureService } from "./drive-structure.service.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";
import { MediaTestController } from "./media-test.controller.js";
import { MediaZipService } from "./media-zip.service.js";
import { ProfilePhotosController } from "./profile-photos.controller.js";
import { ProfilePhotosService } from "./profile-photos.service.js";
import {
  PublicUploadLinksController,
  UploadLinksController,
} from "./public-links.controller.js";
import { PublicLinksService } from "./public-links.service.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

type Req = Request & { params: { token?: string } };
const envInt = (name: string, dflt: number) => () =>
  Number(process.env[name]) || dflt;
// Fake-mode tests send x-test-ip so each test gets its own per-IP bucket.
const clientIp = (req: Req): string =>
  (testingEnabled() && String(req.headers["x-test-ip"] ?? "")) ||
  String(req.ip);

// Public link uploads: files per hour per link and per IP, plus a request burst cap per IP.
const linkThrottlers = [
  {
    name: "link",
    ttl: 3_600_000,
    limit: envInt("UPLOAD_LINK_FILES_PER_HOUR", 200),
    getTracker: (req: Record<string, unknown>) =>
      String((req as unknown as Req).params?.token),
  },
  {
    name: "ip",
    ttl: 3_600_000,
    limit: envInt("UPLOAD_LINK_FILES_PER_IP_HOUR", 60),
    getTracker: (req: Record<string, unknown>) =>
      clientIp(req as unknown as Req),
  },
  {
    name: "burst",
    ttl: 60_000,
    limit: envInt("UPLOAD_LINK_REQUESTS_PER_MINUTE", 1500),
    getTracker: (req: Record<string, unknown>) =>
      clientIp(req as unknown as Req),
  },
];

// JobsModule, DRIZZLE, and the integration adapters are global.
@Module({
  imports: [
    BandsModule,
    GoogleConnectModule,
    ThrottlerModule.forRoot({ throttlers: linkThrottlers }),
  ],
  controllers: [
    DriveController,
    MediaController,
    ProfilePhotosController,
    UploadsController,
    UploadLinksController,
    PublicUploadLinksController,
    ...(testingEnabled() ? [MediaTestController] : []),
  ],
  providers: [
    DriveStructureService,
    MediaService,
    DrivePollerService,
    ProfilePhotosService,
    MediaZipService,
    UploadsService,
    PublicLinksService,
  ],
  exports: [
    DriveStructureService,
    MediaService,
    ProfilePhotosService,
    UploadsService,
  ],
})
export class MediaModule {}
