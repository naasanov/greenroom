import { Global, Module, type Provider } from "@nestjs/common";
import { EMAIL } from "./email/email.adapter.js";
import { RealEmailAdapter } from "./email/email.real.js";
import { FakeIntegrationsRegistry } from "./fake-registry.js";
import { GITHUB } from "./github/github.adapter.js";
import { RealGithubAdapter } from "./github/github.real.js";
import { GOOGLE_CALENDAR } from "./google-calendar/google-calendar.adapter.js";
import { RealGoogleCalendarAdapter } from "./google-calendar/google-calendar.real.js";
import { GOOGLE_DRIVE } from "./google-drive/google-drive.adapter.js";
import { RealGoogleDriveAdapter } from "./google-drive/google-drive.real.js";
import { GOOGLE_OAUTH } from "./google-oauth/google-oauth.adapter.js";
import { RealGoogleOAuthAdapter } from "./google-oauth/google-oauth.real.js";
import { GOOGLE_PLACES } from "./google-places/google-places.adapter.js";
import { RealGooglePlacesAdapter } from "./google-places/google-places.real.js";
import { SONGSTERR } from "./songsterr/songsterr.adapter.js";
import { RealSongsterrAdapter } from "./songsterr/songsterr.real.js";
import { SPOTIFY } from "./spotify/spotify.adapter.js";
import { RealSpotifyAdapter } from "./spotify/spotify.real.js";
import { YOUTUBE } from "./youtube/youtube.adapter.js";
import { RealYoutubeAdapter } from "./youtube/youtube.real.js";

const isFake = (): boolean => process.env.INTEGRATIONS_MODE === "fake";

// The mode is read when the provider is instantiated, after env loading.
function bind(
  token: symbol,
  pickFake: (r: FakeIntegrationsRegistry) => unknown,
  Real: new () => unknown,
): Provider {
  return {
    provide: token,
    inject: [FakeIntegrationsRegistry],
    useFactory: (r: FakeIntegrationsRegistry): unknown =>
      isFake() ? pickFake(r) : new Real(),
  };
}

const providers: Provider[] = [
  FakeIntegrationsRegistry,
  bind(GOOGLE_OAUTH, (r) => r.googleOAuth, RealGoogleOAuthAdapter),
  bind(GOOGLE_DRIVE, (r) => r.googleDrive, RealGoogleDriveAdapter),
  bind(GOOGLE_CALENDAR, (r) => r.googleCalendar, RealGoogleCalendarAdapter),
  bind(GOOGLE_PLACES, (r) => r.googlePlaces, RealGooglePlacesAdapter),
  bind(SPOTIFY, (r) => r.spotify, RealSpotifyAdapter),
  bind(YOUTUBE, (r) => r.youtube, RealYoutubeAdapter),
  bind(SONGSTERR, (r) => r.songsterr, RealSongsterrAdapter),
  bind(GITHUB, (r) => r.github, RealGithubAdapter),
  bind(EMAIL, (r) => r.email, RealEmailAdapter),
];

@Global()
@Module({
  providers,
  exports: [
    FakeIntegrationsRegistry,
    GOOGLE_OAUTH,
    GOOGLE_DRIVE,
    GOOGLE_CALENDAR,
    GOOGLE_PLACES,
    SPOTIFY,
    YOUTUBE,
    SONGSTERR,
    GITHUB,
    EMAIL,
  ],
})
export class IntegrationsModule {}
