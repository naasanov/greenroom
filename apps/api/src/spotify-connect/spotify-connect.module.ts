import { Module } from "@nestjs/common";
import { SpotifyConnectController } from "./spotify-connect.controller.js";
import { SpotifyConnectionsService } from "./spotify-connections.service.js";

// DRIZZLE and the integration adapters are global.
@Module({
  controllers: [SpotifyConnectController],
  providers: [SpotifyConnectionsService],
  exports: [SpotifyConnectionsService],
})
export class SpotifyConnectModule {}
