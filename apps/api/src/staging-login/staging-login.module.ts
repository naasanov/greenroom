import { Module } from "@nestjs/common";
import { DemoBandService } from "./demo-band.service.js";
import { StagingLoginController } from "./staging-login.controller.js";

@Module({
  controllers: [StagingLoginController],
  providers: [DemoBandService],
})
export class StagingLoginModule {}
