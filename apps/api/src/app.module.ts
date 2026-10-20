import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { BandsModule } from "./bands/bands.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/index.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { SongsModule } from "./songs/songs.module.js";
import { testingEnabled } from "./testing/testing.enabled.js";
import { TestingModule } from "./testing/testing.module.js";

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    AuthModule,
    BandsModule,
    EventsModule,
    JobsModule,
    SongsModule,
    // The test-control API is only registered with fakes outside production.
    ...(testingEnabled() ? [TestingModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
