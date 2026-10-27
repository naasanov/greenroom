import { Module } from "@nestjs/common";
import { GoogleConnectController } from "./google-connect.controller.js";
import { GoogleLinksService } from "./google-links.service.js";

// DRIZZLE and the integration adapters are global; this module imports no feature modules.
@Module({
  controllers: [GoogleConnectController],
  providers: [GoogleLinksService],
  exports: [GoogleLinksService],
})
export class GoogleConnectModule {}
