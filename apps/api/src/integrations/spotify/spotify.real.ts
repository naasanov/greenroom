import { notImplemented } from "../not-implemented.js";
import type {
  SpotifyAdapter,
  SpotifyCreatePlaylistResult,
  SpotifyPlaylistResult,
  SpotifyTrack,
  SpotifyTrackResult,
  SpotifyWriteResult,
} from "./spotify.adapter.js";

const ni = <T>(): Promise<T> => notImplemented("Spotify", "3.3");
const ni53 = <T>(): Promise<T> => notImplemented("Spotify", "5.3");

export class RealSpotifyAdapter implements SpotifyAdapter {
  searchTracks(): Promise<SpotifyTrack[]> {
    return ni();
  }
  getTrack(): Promise<SpotifyTrackResult> {
    return ni();
  }
  getPublicPlaylist(): Promise<SpotifyPlaylistResult> {
    return ni();
  }
  createPlaylist(): Promise<SpotifyCreatePlaylistResult> {
    return ni53();
  }
  addTracksToPlaylist(): Promise<SpotifyWriteResult> {
    return ni53();
  }
  getPrivatePlaylist(): Promise<SpotifyPlaylistResult> {
    return ni53();
  }
}
