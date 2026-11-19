import { FakeEmailAdapter } from "./email/email.fake.js";
import { FakeGithubAdapter } from "./github/github.fake.js";
import { FakeGoogleDriveAdapter } from "./google-drive/google-drive.fake.js";
import { FakeGoogleOAuthAdapter } from "./google-oauth/google-oauth.fake.js";
import { FakeGooglePlacesAdapter } from "./google-places/google-places.fake.js";
import { FakeMusicLinkAdapter } from "./musiclink/musiclink.fake.js";
import { FakeSpotifyAdapter } from "./spotify/spotify.fake.js";
import { FakeUltimateGuitarAdapter } from "./ultimate-guitar/ultimate-guitar.fake.js";
import { FakeYoutubeAdapter } from "./youtube/youtube.fake.js";

/** Holds one instance of every fake so tests can seed and reset them together. */
export class FakeIntegrationsRegistry {
  readonly googleOAuth = new FakeGoogleOAuthAdapter();
  readonly googleDrive = new FakeGoogleDriveAdapter();
  readonly googlePlaces = new FakeGooglePlacesAdapter();
  readonly spotify = new FakeSpotifyAdapter();
  readonly youtube = new FakeYoutubeAdapter();
  readonly musiclink = new FakeMusicLinkAdapter();
  readonly ultimateGuitar = new FakeUltimateGuitarAdapter();
  readonly github = new FakeGithubAdapter();
  readonly email = new FakeEmailAdapter();

  resetAll(): void {
    this.googleOAuth.reset();
    this.googleDrive.reset();
    this.googlePlaces.reset();
    this.spotify.reset();
    this.youtube.reset();
    this.musiclink.reset();
    this.ultimateGuitar.reset();
    this.github.reset();
    this.email.reset();
  }
}
