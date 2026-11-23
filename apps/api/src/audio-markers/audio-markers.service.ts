import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq } from "drizzle-orm";
import { audioMarkers, users, type Database } from "@greenroom/db";
import type {
  AudioMarker,
  CreateAudioMarker,
  UpdateAudioMarker,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { FilesService } from "../files/files.service.js";

export const MAX_MARKERS_PER_FILE = 200;

const columns = {
  id: audioMarkers.id,
  fileId: audioMarkers.fileId,
  positionMs: audioMarkers.positionMs,
  title: audioMarkers.title,
  createdAt: audioMarkers.createdAt,
  updatedAt: audioMarkers.updatedAt,
  userId: users.id,
  displayName: users.displayName,
};

type Row = {
  id: string;
  fileId: string;
  positionMs: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  displayName: string | null;
};

const toMarker = (r: Row): AudioMarker => ({
  id: r.id,
  fileId: r.fileId,
  positionMs: r.positionMs,
  title: r.title,
  createdBy:
    r.userId && r.displayName
      ? { userId: r.userId, displayName: r.displayName }
      : null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class AudioMarkersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly files: FilesService,
  ) {}

  async list(bandId: string, fileId: string): Promise<AudioMarker[]> {
    const rows = await this.db
      .select(columns)
      .from(audioMarkers)
      .leftJoin(users, eq(users.id, audioMarkers.createdBy))
      .where(
        and(eq(audioMarkers.bandId, bandId), eq(audioMarkers.fileId, fileId)),
      )
      .orderBy(asc(audioMarkers.positionMs), asc(audioMarkers.createdAt));
    return rows.map(toMarker);
  }

  async create(
    bandId: string,
    userId: string,
    fileId: string,
    body: CreateAudioMarker,
  ): Promise<AudioMarker> {
    const file = await this.files.stat(bandId, fileId);
    if (!file.mimeType.startsWith("audio/")) {
      throw new BadRequestException("Markers can only be added to audio files");
    }
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: count() })
      .from(audioMarkers)
      .where(
        and(eq(audioMarkers.bandId, bandId), eq(audioMarkers.fileId, fileId)),
      );
    if (n >= MAX_MARKERS_PER_FILE) {
      throw new BadRequestException(
        `A file can have at most ${MAX_MARKERS_PER_FILE} markers`,
      );
    }
    const [row] = await this.db
      .insert(audioMarkers)
      .values({
        bandId,
        fileId,
        positionMs: body.positionMs,
        title: body.title,
        createdBy: userId,
      })
      .returning({ id: audioMarkers.id });
    return this.get(bandId, row!.id);
  }

  async update(
    bandId: string,
    id: string,
    body: UpdateAudioMarker,
  ): Promise<AudioMarker> {
    const [row] = await this.db
      .update(audioMarkers)
      .set({ positionMs: body.positionMs, title: body.title })
      .where(and(eq(audioMarkers.id, id), eq(audioMarkers.bandId, bandId)))
      .returning({ id: audioMarkers.id });
    if (!row) throw new NotFoundException("Marker not found");
    return this.get(bandId, id);
  }

  async remove(bandId: string, id: string): Promise<void> {
    const rows = await this.db
      .delete(audioMarkers)
      .where(and(eq(audioMarkers.id, id), eq(audioMarkers.bandId, bandId)))
      .returning({ id: audioMarkers.id });
    if (rows.length === 0) throw new NotFoundException("Marker not found");
  }

  private async get(bandId: string, id: string): Promise<AudioMarker> {
    const [row] = await this.db
      .select(columns)
      .from(audioMarkers)
      .leftJoin(users, eq(users.id, audioMarkers.createdBy))
      .where(and(eq(audioMarkers.id, id), eq(audioMarkers.bandId, bandId)));
    if (!row) throw new NotFoundException("Marker not found");
    return toMarker(row);
  }
}
