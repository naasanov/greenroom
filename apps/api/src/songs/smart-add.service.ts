import { Inject, Injectable } from "@nestjs/common";
import type { ResolveResult, SongCandidate } from "@greenroom/shared";
import {
  SPOTIFY,
  YOUTUBE,
  parseSpotifyId,
  parseYoutubeId,
  type SpotifyAdapter,
  type SpotifyTrack,
  type YoutubeAdapter,
} from "../integrations/index.js";
import { SongsService } from "./songs.service.js";
import type { SongIndex } from "./song-match.js";

const SPOTIFY_TRACK_RE =
  /spotify:track:|open\.spotify\.com\/(?:intl-[a-z]+\/)?track\//;
const SPOTIFY_PLAYLIST_RE =
  /spotify:playlist:|open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\//;
const YOUTUBE_RE = /youtube\.com\/|youtu\.be\//;
const URL_RE = /^https?:\/\//i;
const SEARCH_LIMIT = 10;

/** Turns the add sheet's single input into prefilled song candidates. */
@Injectable()
export class SmartAddService {
  constructor(
    private readonly songs: SongsService,
    @Inject(SPOTIFY) private readonly spotify: SpotifyAdapter,
    @Inject(YOUTUBE) private readonly youtube: YoutubeAdapter,
  ) {}

  async resolve(bandId: string, rawInput: string): Promise<ResolveResult> {
    const input = rawInput.trim();
    if (SPOTIFY_PLAYLIST_RE.test(input)) {
      return { kind: "playlist", candidates: [] };
    }
    const index = await this.songs.index(bandId);

    if (SPOTIFY_TRACK_RE.test(input)) {
      const id = parseSpotifyId(input);
      const res = id ? await this.spotify.getTrack(id) : null;
      return {
        kind: "spotify-link",
        candidates:
          res?.status === "ok" ? [this.fromTrack(res.track, index)] : [],
      };
    }

    if (YOUTUBE_RE.test(input)) {
      const videoId = parseYoutubeId(input);
      const res = videoId ? await this.youtube.getVideoMetadata(input) : null;
      if (res?.status !== "ok") return { kind: "youtube-link", candidates: [] };
      const { video } = res;
      const url = `https://www.youtube.com/watch?v=${video.videoId}`;
      return {
        kind: "youtube-link",
        candidates: [
          {
            source: "youtube",
            title: video.title,
            artist: video.channelName || null,
            durationSeconds: null,
            imageUrl: video.thumbnailUrl || null,
            spotifyTrackId: null,
            youtubeUrl: url,
            references: [{ label: "YouTube", value: url }],
            existingSongId: index.find({
              title: video.title,
              artist: video.channelName,
            }),
          },
        ],
      };
    }

    // Other links are not searchable text.
    if (URL_RE.test(input)) return { kind: "search", candidates: [] };
    const tracks = await this.spotify.searchTracks(input, SEARCH_LIMIT);
    return {
      kind: "search",
      candidates: tracks.map((t) => this.fromTrack(t, index)),
    };
  }

  private fromTrack(t: SpotifyTrack, index: SongIndex): SongCandidate {
    const artist = t.artists.join(", ") || null;
    return {
      source: "spotify",
      title: t.title,
      artist,
      durationSeconds: Math.round(t.durationMs / 1000),
      imageUrl: t.albumArtUrl,
      spotifyTrackId: t.id,
      youtubeUrl: null,
      references: [{ label: "Spotify", value: t.url }],
      existingSongId: index.find({
        title: t.title,
        artist,
        spotifyTrackId: t.id,
      }),
    };
  }
}
