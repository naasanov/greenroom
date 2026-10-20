import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { BandsModule } from "./bands/bands.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/index.js";
import { testingEnabled } from "./testing/testing.enabled.js";
import { TestingModule } from "./testing/testing.module.js";

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    AuthModule,
    BandsModule,
    // The test-control API is only registered with fakes outside production.
    ...(testingEnabled() ? [TestingModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
