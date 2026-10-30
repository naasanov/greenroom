import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  bands,
  memberships,
  userPhotos,
  users,
  type Database,
} from "@greenroom/db";
import { MAX_BAND_PHOTO_BYTES } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import type { DriveDownloadResult } from "../integrations/index.js";
import {
  DriveStructureService,
  type DriveContext,
} from "./drive-structure.service.js";
import { bandPhotoUrl, userPhotoUrl, UUID_RE } from "./media-util.js";

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface PhotoStream {
  result: Extract<DriveDownloadResult, { status: "ok" }>;
  mimeType: string;
}

export interface UserPhotoBytes {
  data: Buffer;
  mimeType: string;
}

const safeImageMime = (m: string): string =>
  m.startsWith("image/") && m !== "image/svg+xml"
    ? m
    : "application/octet-stream";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Band photos, plus the user profile photo mirrored into each band's Profile photos folder. */
@Injectable()
export class ProfilePhotosService {
  private readonly log = new Logger(ProfilePhotosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
  ) {}

  private get drive() {
    return this.structure.drive;
  }

  private validate(file: UploadedImage | undefined): UploadedImage {
    if (!file?.buffer?.length)
      throw new BadRequestException("photo is required");
    if (
      !file.mimetype.startsWith("image/") ||
      file.mimetype === "image/svg+xml"
    )
      throw new UnprocessableEntityException("photo must be an image");
    if (file.size > MAX_BAND_PHOTO_BYTES)
      throw new UnprocessableEntityException("photo is too large");
    return file;
  }

  private async upload(
    ctx: DriveContext,
    prefix: string,
    file: UploadedImage,
  ): Promise<string> {
    const ext = EXT[file.mimetype] ?? "img";
    const name = `${prefix}-${Date.now()}.${ext}`;
    const { sessionUri } = await this.drive.startResumableUpload(ctx.token, {
      name,
      parentId: ctx.photosFolderId,
      mimeType: file.mimetype,
      totalSize: file.buffer.length,
    });
    const res = await this.drive.uploadChunk(ctx.token, sessionUri, {
      start: 0,
      end: file.buffer.length - 1,
      total: file.buffer.length,
      data: file.buffer,
    });
    if (res.status !== "complete")
      throw new BadRequestException("Upload to Drive did not complete");
    return res.file.id;
  }

  private async trashQuietly(ctx: DriveContext, fileId: string | null) {
    if (!fileId) return;
    try {
      await this.drive.trash(ctx.token, fileId);
    } catch {
      // The old file may already be gone; the pointer is replaced regardless.
    }
  }

  // ---- band photo ----

  async setBandPhoto(
    bandId: string,
    file: UploadedImage | undefined,
  ): Promise<string> {
    const img = this.validate(file);
    const ctx = await this.structure.requireContext(bandId);
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    const fileId = await this.upload(ctx, "band-photo", img);
    const photoUrl = bandPhotoUrl(bandId, fileId);
    await this.db
      .update(bands)
      .set({ photoDriveFileId: fileId, photoMimeType: img.mimetype, photoUrl })
      .where(eq(bands.id, bandId));
    await this.trashQuietly(ctx, band?.photoDriveFileId ?? null);
    return photoUrl;
  }

  async clearBandPhoto(bandId: string): Promise<void> {
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band?.photoDriveFileId) return;
    const ctx = await this.structure.context(bandId);
    await this.db
      .update(bands)
      .set({ photoDriveFileId: null, photoMimeType: null, photoUrl: null })
      .where(eq(bands.id, bandId));
    if (ctx) await this.trashQuietly(ctx, band.photoDriveFileId);
  }

  /** Public: no session. Unlinked Drive or no photo is a plain 404. */
  async openBandPhoto(bandId: string): Promise<PhotoStream> {
    if (!UUID_RE.test(bandId)) throw new NotFoundException();
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band?.photoDriveFileId) throw new NotFoundException();
    return this.stream(bandId, band.photoDriveFileId, band.photoMimeType);
  }

  // ---- user profile photo ----

  /** Stores the user's single profile photo, then mirrors it to every band Drive. */
  async setUserPhoto(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<string> {
    const img = this.validate(file);
    await this.db
      .insert(userPhotos)
      .values({ userId, data: img.buffer, mimeType: img.mimetype })
      .onConflictDoUpdate({
        target: userPhotos.userId,
        set: {
          data: img.buffer,
          mimeType: img.mimetype,
          updatedAt: new Date(),
        },
      });
    const photoUrl = userPhotoUrl(userId, Date.now());
    await this.db
      .update(users)
      .set({ avatarUrl: photoUrl })
      .where(eq(users.id, userId));
    await this.syncToBands(userId);
    return photoUrl;
  }

  async clearUserPhoto(userId: string): Promise<void> {
    await this.db.delete(userPhotos).where(eq(userPhotos.userId, userId));
    await this.db
      .update(users)
      .set({ avatarUrl: null })
      .where(eq(users.id, userId));
    await this.syncToBands(userId);
  }

  async openUserPhoto(userId: string): Promise<UserPhotoBytes> {
    if (!UUID_RE.test(userId)) throw new NotFoundException();
    const [row] = await this.db
      .select()
      .from(userPhotos)
      .where(eq(userPhotos.userId, userId));
    if (!row) throw new NotFoundException();
    return { data: row.data, mimeType: safeImageMime(row.mimeType) };
  }

  /** Best effort per band: a failing or unlinked Drive never fails the update. */
  async syncToBands(userId: string): Promise<void> {
    let rows: { bandId: string }[] = [];
    try {
      rows = await this.db
        .select({ bandId: memberships.bandId })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)));
    } catch (err) {
      this.log.warn(`photo sync lookup failed: ${String(err)}`);
    }
    await Promise.all(rows.map((r) => this.syncToBand(r.bandId, userId)));
  }

  /** Mirrors the current profile photo (or its absence) into one band's Drive. */
  async syncToBand(bandId: string, userId: string): Promise<void> {
    try {
      const ctx = await this.structure.context(bandId);
      const m = await this.membership(bandId, userId);
      if (!ctx || !m) return;
      const [photo] = await this.db
        .select()
        .from(userPhotos)
        .where(eq(userPhotos.userId, userId));
      let fileId: string | null = null;
      if (photo) {
        fileId = await this.upload(ctx, `member-${userId}`, {
          buffer: photo.data,
          mimetype: photo.mimeType,
          size: photo.data.length,
          originalname: "profile",
        });
      }
      await this.db
        .update(memberships)
        .set({ photoDriveFileId: fileId })
        .where(eq(memberships.id, m.id));
      await this.trashQuietly(ctx, m.photoDriveFileId);
    } catch (err) {
      this.log.warn(`photo sync to band ${bandId} failed: ${String(err)}`);
    }
  }

  private async membership(bandId: string, userId: string) {
    const [m] = await this.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    return m;
  }

  /** Serves a band Drive copy; kept for photos uploaded before the single profile photo. */
  async openMemberPhoto(bandId: string, userId: string): Promise<PhotoStream> {
    if (!UUID_RE.test(userId)) throw new NotFoundException();
    const m = await this.membership(bandId, userId);
    if (!m?.photoDriveFileId) throw new NotFoundException();
    return this.stream(bandId, m.photoDriveFileId, null);
  }

  private async stream(
    bandId: string,
    fileId: string,
    mime: string | null,
  ): Promise<PhotoStream> {
    const ctx = await this.structure.context(bandId);
    if (!ctx) throw new NotFoundException();
    const result = await this.drive.download(ctx.token, fileId);
    if (result.status !== "ok") throw new NotFoundException();
    let mimeType = mime;
    if (!mimeType) {
      const f = await this.drive.getFile(ctx.token, fileId);
      mimeType = f.status === "ok" ? f.file.mimeType : "image/jpeg";
    }
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml")
      mimeType = "application/octet-stream";
    return { result, mimeType };
  }
}
