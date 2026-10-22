import { Module } from "@nestjs/common";
import { DemoBandService } from "./demo-band.service.js";
import {
  FakeSpotifyController,
  StagingLoginController,
} from "./staging-login.controller.js";

@Module({
  controllers: [StagingLoginController, FakeSpotifyController],
  providers: [DemoBandService],
})
export class StagingLoginModule {}
