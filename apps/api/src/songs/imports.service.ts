import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { songLinks, songs, type Database } from "@greenroom/db";
import {
  SONG_ERROR_CODES,
  type ImportProgress,
  type ImportStatus,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  SPOTIFY,
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyTrack,
} from "../integrations/index.js";
import { JobsService } from "../jobs/index.js";
import { SongIndex } from "./song-match.js";
import { SongsService } from "./songs.service.js";

export const PLAYLIST_IMPORT_QUEUE = "songs-playlist-import";

interface ImportJobData {
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
const MEMORY_TTL_MS = 60 * 60 * 1000;

/**
 * Runs playlist imports as pg-boss jobs. Live counters sit in process memory;
 * the final summary is the job output, so it survives restarts.
 */
@Injectable()
export class ImportsService implements OnModuleInit {
  private live = new Map<
    string,
    { bandId: string; progress: ImportProgress; expires: number }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SPOTIFY) private readonly spotify: SpotifyAdapter,
    private readonly jobs: JobsService,
    private readonly songs: SongsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register<ImportJobData, ImportOutput>(
      PLAYLIST_IMPORT_QUEUE,
      (data, job) => this.run(job.id, data),
      { queue: { retryLimit: 0 } },
    );
  }

  /** Validates the link, then queues the import. Private and missing playlists look the same. */
  async start(bandId: string, url: string): Promise<ImportProgress> {
    const playlistId = PLAYLIST_URL_RE.test(url) ? parseSpotifyId(url) : null;
    if (!playlistId) {
      throw new BadRequestException("Not a Spotify playlist link");
    }
    const res = await this.spotify.getPublicPlaylist(playlistId);
    if (res.status !== "ok") {
      throw new NotFoundException({
        code: SONG_ERROR_CODES.playlistNotFound,
        message: "Can't see this playlist, it might be private",
      });
    }
    const importId = randomUUID();
    const progress = this.blank(importId, "queued", res.playlist.name);
    progress.total = res.playlist.tracks.length;
    this.remember(importId, bandId, progress);
    try {
      await this.jobs.send<ImportJobData>(
        PLAYLIST_IMPORT_QUEUE,
        { bandId, playlistId },
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
      const res = await this.spotify.getPublicPlaylist(data.playlistId);
      if (res.status !== "ok") throw new Error("Playlist not found or private");
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
    } catch {
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
