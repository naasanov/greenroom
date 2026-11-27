import { Module } from "@nestjs/common";
import { YoutubeConnectController } from "./youtube-connect.controller.js";
import { YoutubeConnectionsService } from "./youtube-connections.service.js";

// DRIZZLE and the integration adapters are global.
@Module({
  controllers: [YoutubeConnectController],
  providers: [YoutubeConnectionsService],
  exports: [YoutubeConnectionsService],
})
export class YoutubeConnectModule {}
