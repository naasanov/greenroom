import { FakeEmailAdapter } from "./email/email.fake.js";
import { FakeGithubAdapter } from "./github/github.fake.js";
import { FakeGoogleCalendarAdapter } from "./google-calendar/google-calendar.fake.js";
import { FakeGoogleDriveAdapter } from "./google-drive/google-drive.fake.js";
import { FakeGoogleOAuthAdapter } from "./google-oauth/google-oauth.fake.js";
import { FakeGooglePlacesAdapter } from "./google-places/google-places.fake.js";
import { FakeSongsterrAdapter } from "./songsterr/songsterr.fake.js";
import { FakeSpotifyAdapter } from "./spotify/spotify.fake.js";
import { FakeYoutubeAdapter } from "./youtube/youtube.fake.js";

/** Holds one instance of every fake so tests can seed and reset them together. */
export class FakeIntegrationsRegistry {
  readonly googleOAuth = new FakeGoogleOAuthAdapter();
  readonly googleDrive = new FakeGoogleDriveAdapter();
  readonly googleCalendar = new FakeGoogleCalendarAdapter();
  readonly googlePlaces = new FakeGooglePlacesAdapter();
  readonly spotify = new FakeSpotifyAdapter();
  readonly youtube = new FakeYoutubeAdapter();
  readonly songsterr = new FakeSongsterrAdapter();
  readonly github = new FakeGithubAdapter();
  readonly email = new FakeEmailAdapter();

  resetAll(): void {
    this.googleOAuth.reset();
    this.googleDrive.reset();
    this.googleCalendar.reset();
    this.googlePlaces.reset();
    this.spotify.reset();
    this.youtube.reset();
    this.songsterr.reset();
    this.github.reset();
    this.email.reset();
  }
}
