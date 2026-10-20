import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/index.js";
import { testingEnabled } from "./testing/testing.enabled.js";
import { TestingModule } from "./testing/testing.module.js";

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    // The test-control API is only registered with fakes outside production.
    ...(testingEnabled() ? [TestingModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
