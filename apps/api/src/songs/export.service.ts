import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SONG_ERROR_CODES, type ExportResult } from "@greenroom/shared";
import { SPOTIFY, type SpotifyAdapter } from "../integrations/index.js";
import { SpotifyConnectionsService } from "../spotify-connect/index.js";

export interface ExportableSong {
  id: string;
  title: string;
  spotifyTrackId: string | null;
}

/** Creates a private Spotify playlist in the user's account from ordered songs. */
@Injectable()
export class ExportService {
  constructor(
    @Inject(SPOTIFY) private readonly spotify: SpotifyAdapter,
    private readonly connections: SpotifyConnectionsService,
  ) {}

  async exportSongs(
    userId: string,
    name: string,
    list: ExportableSong[],
  ): Promise<ExportResult> {
    const token = await this.connections.getExportToken(userId);
    const withTrack = list.filter((s) => s.spotifyTrackId);
    if (withTrack.length === 0) {
      throw new UnprocessableEntityException({
        code: SONG_ERROR_CODES.nothingToExport,
        message: "None of these songs have a Spotify link",
      });
    }
    const created = await this.spotify.createPlaylist(token, {
      name,
      isPublic: false,
    });
    if (created.status !== "ok") throw this.connections.exportLoginRequired();
    const added = await this.spotify.addTracksToPlaylist(
      token,
      created.playlist.id,
      withTrack.map((s) => `spotify:track:${s.spotifyTrackId}`),
    );
    if (added.status !== "ok") {
      if (added.status === "unauthorized") {
        throw this.connections.exportLoginRequired();
      }
      throw new ConflictException(
        "Spotify could not add songs to the playlist",
      );
    }
    return {
      playlistId: created.playlist.id,
      playlistUrl: created.playlist.url,
      name: created.playlist.name,
      exported: withTrack.length,
      skipped: list
        .filter((s) => !s.spotifyTrackId)
        .map((s) => ({ songId: s.id, title: s.title })),
    };
  }
}
