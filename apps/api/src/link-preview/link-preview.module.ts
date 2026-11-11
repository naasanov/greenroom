import { Module } from "@nestjs/common";
import { LinkPreviewController } from "./link-preview.controller.js";
import { LinkPreviewService } from "./link-preview.service.js";

@Module({
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService],
})
export class LinkPreviewModule {}
