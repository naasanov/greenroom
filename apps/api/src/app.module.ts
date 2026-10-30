import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { BandsModule } from "./bands/bands.module.js";
import { CalendarSyncModule } from "./calendar-sync/calendar-sync.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { EventsModule } from "./events/events.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";
import { GoogleConnectModule } from "./google-connect/google-connect.module.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/index.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LineupsModule } from "./lineups/lineups.module.js";
import { MediaModule } from "./media/media.module.js";
import { LinksModule } from "./links/links.module.js";
import { PublicCalendarModule } from "./public-calendar/public-calendar.module.js";
import { SetlistsModule } from "./setlists/setlists.module.js";
import { SongsModule } from "./songs/songs.module.js";
import { SpotifyConnectModule } from "./spotify-connect/spotify-connect.module.js";
import { stagingLoginEnabled } from "./staging-login/staging-login.enabled.js";
import { StagingLoginModule } from "./staging-login/staging-login.module.js";
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
    SpotifyConnectModule,
    GoogleConnectModule,
    CalendarSyncModule,
    SetlistsModule,
    LineupsModule,
    LinksModule,
    MediaModule,
    PublicCalendarModule,
    FeedbackModule,
    // The test-control API is only registered with fakes outside production.
    ...(testingEnabled() ? [TestingModule] : []),
    // Passcode sign-in stands in for Google when fakes run with a passcode secret.
    ...(stagingLoginEnabled() ? [StagingLoginModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
