import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  SONG_ERROR_CODES,
  YOUTUBE_ERROR_CODES,
  YOUTUBE_PLAYLIST_MAX,
  youtubeVideoId,
  type YoutubeExportResult,
} from "@greenroom/shared";
import { YOUTUBE, type YoutubeAdapter } from "../integrations/index.js";
import { YoutubeConnectionsService } from "../youtube-connect/index.js";

export interface YoutubeExportableSong {
  id: string;
  title: string;
  youtubeUrl: string | null;
  youtubeMusicUrl: string | null;
}

/** Creates a private YouTube playlist in the user's account from ordered songs. */
@Injectable()
export class YoutubeExportService {
  private readonly log = new Logger(YoutubeExportService.name);

  constructor(
    @Inject(YOUTUBE) private readonly youtube: YoutubeAdapter,
    private readonly connections: YoutubeConnectionsService,
  ) {}

  async exportSongs(
    userId: string,
    name: string,
    list: YoutubeExportableSong[],
  ): Promise<YoutubeExportResult> {
    const token = await this.connections.getExportToken(userId);
    const videoOf = new Map(
      list.map((s) => [
        s.id,
        youtubeVideoId(s.youtubeUrl) ?? youtubeVideoId(s.youtubeMusicUrl),
      ]),
    );
    const unique = [...new Set([...videoOf.values()].filter((v) => !!v))];
    if (unique.length === 0) {
      throw new UnprocessableEntityException({
        code: SONG_ERROR_CODES.nothingToExport,
        message: "None of these songs have a YouTube link",
      });
    }
    const videoIds = unique.slice(0, YOUTUBE_PLAYLIST_MAX) as string[];

    try {
      const created = await this.youtube.createPlaylist(token, {
        name,
        description: "Exported from Greenroom",
        isPublic: false,
      });
      if (created.status === "quota-exceeded") throw this.quotaExceeded();
      if (created.status === "no-channel") {
        throw new ConflictException({
          code: YOUTUBE_ERROR_CODES.noChannel,
          message: "That Google account has no YouTube channel",
        });
      }
      if (created.status !== "ok") throw this.connections.loginRequired();

      const added = await this.youtube.addPlaylistItems(
        token,
        created.playlist.id,
        videoIds,
      );
      if (added.status === "quota-exceeded") throw this.quotaExceeded();
      if (added.status === "unauthorized")
        throw this.connections.loginRequired();
      if (added.status !== "ok") {
        throw new BadGatewayException(
          "YouTube could not add songs to the playlist",
        );
      }
      const rejected = new Set(added.rejected);
      return {
        playlistId: created.playlist.id,
        playlistUrl: created.playlist.url,
        name: created.playlist.name,
        exported: added.added.length,
        skipped: list
          .filter((s) => {
            const v = videoOf.get(s.id);
            return !v || rejected.has(v);
          })
          .map((s) => ({ songId: s.id, title: s.title })),
        leftOut: unique.length - videoIds.length,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.log.error(
        `youtube export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException("YouTube could not save the playlist");
    }
  }

  private quotaExceeded(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: YOUTUBE_ERROR_CODES.quotaExceeded,
      message: "YouTube's daily limit for Greenroom has been reached",
    });
  }
}
