import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, memberships, type Database } from "@greenroom/db";
import { MAX_BAND_PHOTO_BYTES } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import type { DriveDownloadResult } from "../integrations/index.js";
import {
  DriveStructureService,
  type DriveContext,
} from "./drive-structure.service.js";
import { bandPhotoUrl, memberPhotoUrl, UUID_RE } from "./media-util.js";

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

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Band and per-band member photos, stored in the band's Profile photos folder. */
@Injectable()
export class ProfilePhotosService {
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

  // ---- member photo ----

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

  async setMemberPhoto(
    bandId: string,
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<string> {
    const img = this.validate(file);
    const ctx = await this.structure.requireContext(bandId);
    const m = await this.membership(bandId, userId);
    if (!m) throw new NotFoundException("Band not found");
    const fileId = await this.upload(ctx, `member-${userId}`, img);
    await this.db
      .update(memberships)
      .set({ photoDriveFileId: fileId })
      .where(eq(memberships.id, m.id));
    await this.trashQuietly(ctx, m.photoDriveFileId);
    return memberPhotoUrl(bandId, userId, fileId)!;
  }

  async clearMemberPhoto(bandId: string, userId: string): Promise<void> {
    const m = await this.membership(bandId, userId);
    if (!m?.photoDriveFileId) return;
    const ctx = await this.structure.context(bandId);
    await this.db
      .update(memberships)
      .set({ photoDriveFileId: null })
      .where(eq(memberships.id, m.id));
    if (ctx) await this.trashQuietly(ctx, m.photoDriveFileId);
  }

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
