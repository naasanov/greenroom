import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Logger,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { songLinks, songs, type Database } from "@greenroom/db";
import {
  SONG_ERROR_CODES,
  type ImportProgress,
  type ImportStatus,
  type PlaylistCheck,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  SPOTIFY,
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyPlaylistResult,
  type SpotifyTrack,
} from "../integrations/index.js";
import { JobsService } from "../jobs/index.js";
import { SpotifyConnectionsService } from "../spotify-connect/index.js";
import { SongIndex } from "./song-match.js";
import { SongsService } from "./songs.service.js";

export const PLAYLIST_IMPORT_QUEUE = "songs-playlist-import";

interface ImportJobData {
  userId: string;
  bandId: string;
  playlistId: string;
}

type Counters = Pick<
  ImportProgress,
  "total" | "done" | "added" | "skipped" | "failed"
>;

interface ImportOutput extends Counters {
  playlistName: string;
}

const PLAYLIST_URL_RE =
  /spotify:playlist:|open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\//;
const NOT_READABLE_MESSAGE =
  "Only playlists you own or collaborate on can be imported";
const MEMORY_TTL_MS = 60 * 60 * 1000;

/**
 * Runs playlist imports as pg-boss jobs. Live counters sit in process memory;
 * the final summary is the job output, so it survives restarts.
 */
@Injectable()
export class ImportsService implements OnModuleInit {
  private readonly log = new Logger(ImportsService.name);
  private live = new Map<
    string,
    { bandId: string; progress: ImportProgress; expires: number }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SPOTIFY) private readonly spotify: SpotifyAdapter,
    private readonly jobs: JobsService,
    private readonly songs: SongsService,
    private readonly connections: SpotifyConnectionsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<ImportJobData, ImportOutput>(
      PLAYLIST_IMPORT_QUEUE,
      (data, job) => this.run(job.id, data),
      { queue: { retryLimit: 0 } },
    );
  }

  /** Looks the playlist up without queueing anything; a missing login is a 409. */
  async check(userId: string, url: string): Promise<PlaylistCheck> {
    const playlistId = PLAYLIST_URL_RE.test(url) ? parseSpotifyId(url) : null;
    const invalid: PlaylistCheck = {
      status: "invalid",
      name: null,
      trackCount: null,
    };
    if (!playlistId) return invalid;
    const token = await this.requireToken(userId);
    const res = await this.spotify.checkPlaylist(token, playlistId);
    switch (res.status) {
      case "ok":
        return {
          status: "importable",
          name: res.name,
          trackCount: res.trackCount,
        };
      case "metadata-only":
        return { status: "metadata-only", name: res.name, trackCount: null };
      case "not-found":
        return invalid;
      case "unauthorized":
        throw this.loginRequired();
    }
  }

  /** Validates the link, then queues the import; unreadable playlists are a 403, missing ones a 404. */
  async start(
    userId: string,
    bandId: string,
    url: string,
  ): Promise<ImportProgress> {
    const playlistId = PLAYLIST_URL_RE.test(url) ? parseSpotifyId(url) : null;
    if (!playlistId) {
      throw new BadRequestException("Not a Spotify playlist link");
    }
    const res = await this.fetchPlaylist(userId, playlistId);
    if (res.status === "forbidden" || res.status === "metadata-only") {
      throw new ForbiddenException({
        code: SONG_ERROR_CODES.playlistForbidden,
        message: NOT_READABLE_MESSAGE,
      });
    }
    if (res.status !== "ok") {
      throw new NotFoundException({
        code: SONG_ERROR_CODES.playlistNotFound,
        message: "Can't find this playlist. Check the link.",
      });
    }
    const importId = randomUUID();
    const progress = this.blank(importId, "queued", res.playlist.name);
    progress.total = res.playlist.tracks.length;
    this.remember(importId, bandId, progress);
    try {
      await this.jobs.send<ImportJobData>(
        PLAYLIST_IMPORT_QUEUE,
        { userId, bandId, playlistId },
        { id: importId, retryLimit: 0 },
      );
    } catch (err) {
      this.live.delete(importId);
      throw err;
    }
    return { ...progress };
  }

  async status(bandId: string, importId: string): Promise<ImportProgress> {
    const mem = this.live.get(importId);
    if (mem) {
      if (mem.bandId !== bandId)
        throw new NotFoundException("Import not found");
      return { ...mem.progress };
    }
    const job = await this.jobs
      .getJob<ImportJobData>(PLAYLIST_IMPORT_QUEUE, importId)
      .catch(() => null);
    if (!job || job.data.bandId !== bandId) {
      throw new NotFoundException("Import not found");
    }
    const out = job.output as Partial<ImportOutput> | null;
    const status: ImportStatus =
      job.state === "completed"
        ? "completed"
        : job.state === "active"
          ? "running"
          : job.state === "created" || job.state === "retry"
            ? "queued"
            : "failed";
    return {
      ...this.blank(importId, status, out?.playlistName ?? null),
      ...(job.state === "completed" ? out : {}),
      error: status === "failed" ? "Import failed" : null,
    };
  }

  // ---- job body ----

  private async run(
    importId: string,
    data: ImportJobData,
  ): Promise<ImportOutput> {
    const progress =
      this.live.get(importId)?.progress ??
      this.blank(importId, "running", null);
    progress.status = "running";
    this.remember(importId, data.bandId, progress);
    try {
      const res = await this.fetchPlaylist(data.userId, data.playlistId);
      if (res.status === "forbidden" || res.status === "metadata-only") {
        throw new Error(NOT_READABLE_MESSAGE);
      }
      if (res.status !== "ok") throw new Error("Playlist not found");
      const { playlist } = res;
      progress.playlistName = playlist.name;
      progress.total = playlist.tracks.length;

      const index: SongIndex = await this.songs.index(data.bandId);
      for (const track of playlist.tracks) {
        await this.importTrack(data.bandId, track, index, progress);
        progress.done++;
      }
      progress.status = "completed";
      return {
        playlistName: playlist.name,
        total: progress.total,
        done: progress.done,
        added: progress.added,
        skipped: progress.skipped,
        failed: progress.failed,
      };
    } catch (err) {
      progress.status = "failed";
      progress.error = err instanceof Error ? err.message : "Import failed";
      throw err;
    } finally {
      this.live.get(importId)!.expires = Date.now() + MEMORY_TTL_MS;
    }
  }

  /** Reads via the user's Spotify login; no usable login is a 409 for the client to act on. */
  private async fetchPlaylist(
    userId: string,
    playlistId: string,
  ): Promise<Exclude<SpotifyPlaylistResult, { status: "unauthorized" }>> {
    const token = await this.requireToken(userId);
    const res = await this.spotify.getPlaylist(token, playlistId);
    if (res.status === "unauthorized") throw this.loginRequired();
    return res;
  }

  private async requireToken(userId: string): Promise<string> {
    const token = await this.connections.getAccessToken(userId);
    if (!token) throw this.loginRequired();
    return token;
  }

  private loginRequired(): ConflictException {
    return new ConflictException({
      code: SONG_ERROR_CODES.spotifyLoginRequired,
      message: "Connect Spotify to import playlists",
    });
  }

  private async importTrack(
    bandId: string,
    t: SpotifyTrack,
    index: SongIndex,
    progress: ImportProgress,
  ): Promise<void> {
    const artist = t.artists.join(", ") || null;
    const probe = { title: t.title, artist, spotifyTrackId: t.id };
    if (index.find(probe)) {
      progress.skipped++;
      return;
    }
    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(songs)
          .values({
            bandId,
            title: t.title,
            artist,
            durationSeconds: Math.round(t.durationMs / 1000),
            imageUrl: t.albumArtUrl,
            spotifyTrackId: t.id,
          })
          .returning({ id: songs.id });
        await tx.insert(songLinks).values({
          songId: row!.id,
          label: "Spotify",
          value: t.url,
          position: 0,
        });
        return row!.id;
      });
      index.add({ id, ...probe });
      progress.added++;
    } catch (err) {
      this.log.warn(
        `playlist track import failed bandId=${bandId} trackId=${t.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      progress.failed++;
    }
  }

  private blank(
    importId: string,
    status: ImportStatus,
    playlistName: string | null,
  ): ImportProgress {
    return {
      importId,
      status,
      playlistName,
      total: 0,
      done: 0,
      added: 0,
      skipped: 0,
      failed: 0,
      error: null,
    };
  }

  private remember(
    importId: string,
    bandId: string,
    progress: ImportProgress,
  ): void {
    const now = Date.now();
    for (const [id, v] of this.live) if (v.expires < now) this.live.delete(id);
    this.live.set(importId, {
      bandId,
      progress,
      expires: Number.POSITIVE_INFINITY,
    });
  }
}
