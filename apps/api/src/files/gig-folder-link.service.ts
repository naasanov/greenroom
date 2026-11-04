import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, isNull, ne } from "drizzle-orm";
import { gigs, mediaItems, type Database } from "@greenroom/db";
import {
  FILES_ERROR_CODES,
  MEDIA_ERROR_CODES,
  type GigMedia,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { DRIVE_FOLDER_MIME } from "../integrations/index.js";
import { DriveStructureService } from "../media/drive-structure.service.js";
import { insertSubfolder, upsertDriveItem } from "../media/media-ingest.js";
import { MediaService } from "../media/media.service.js";

/** Attaches an existing Drive folder to a gig and imports its contents as media. */
@Injectable()
export class GigFolderLinkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
    private readonly media: MediaService,
  ) {}

  async link(
    bandId: string,
    gigId: string,
    folderId: string,
  ): Promise<GigMedia> {
    const gig = await this.structure.loadGig(bandId, gigId);
    if (gig.driveFolderId) {
      throw new ConflictException({
        code: FILES_ERROR_CODES.gigAlreadyHasFolder,
        message: "This gig already has a Drive folder",
      });
    }
    const ctx = await this.structure.requireContext(bandId);
    const chain = await this.structure.ancestry(
      ctx.token,
      folderId,
      ctx.rootFolderId,
    );
    const folder = chain?.[0];
    if (!folder) {
      throw new UnprocessableEntityException({
        code: FILES_ERROR_CODES.outsideRoot,
        message: "The folder must be inside the Files root",
      });
    }
    if (folder.mimeType !== DRIVE_FOLDER_MIME) {
      throw new UnprocessableEntityException({
        code: MEDIA_ERROR_CODES.notAFolder,
        message: "The chosen item is not a folder in Drive",
      });
    }
    if (folder.id === ctx.rootFolderId || folder.id === ctx.gigsFolderId) {
      throw new UnprocessableEntityException({
        code: FILES_ERROR_CODES.outsideRoot,
        message: "The Files root and gigs root cannot be a gig folder",
      });
    }
    const [taken] = await this.db
      .select({ id: gigs.id })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, bandId),
          eq(gigs.driveFolderId, folder.id),
          isNull(gigs.deletedAt),
          ne(gigs.id, gigId),
        ),
      );
    if (taken) throw this.alreadyLinked();

    const children = await this.structure.drive.listChildren(
      ctx.token,
      folder.id,
    );
    const subfolders = children.filter((c) => c.mimeType === DRIVE_FOLDER_MIME);
    const subChildren = await Promise.all(
      subfolders.map((s) => this.structure.drive.listChildren(ctx.token, s.id)),
    );

    await this.db.transaction(async (tx) => {
      const [won] = await tx
        .update(gigs)
        .set({ driveFolderId: folder.id })
        .where(and(eq(gigs.id, gigId), isNull(gigs.driveFolderId)))
        .returning({ id: gigs.id });
      if (!won) {
        throw new ConflictException({
          code: FILES_ERROR_CODES.gigAlreadyHasFolder,
          message: "This gig already has a Drive folder",
        });
      }
      const existingFor = async (driveFileId: string) =>
        (
          await tx
            .select()
            .from(mediaItems)
            .where(
              and(
                eq(mediaItems.bandId, bandId),
                eq(mediaItems.driveFileId, driveFileId),
              ),
            )
        )[0];
      for (const f of children) {
        if (f.mimeType === DRIVE_FOLDER_MIME) continue;
        await upsertDriveItem(
          tx,
          bandId,
          { gigId, folderId: null },
          f,
          await existingFor(f.id),
        );
      }
      for (const [i, sub] of subfolders.entries()) {
        const row = await insertSubfolder(tx, bandId, gigId, sub);
        if (!row) continue;
        for (const f of subChildren[i]!) {
          if (f.mimeType === DRIVE_FOLDER_MIME) continue;
          await upsertDriveItem(
            tx,
            bandId,
            { gigId, folderId: row.id },
            f,
            await existingFor(f.id),
          );
        }
      }
    });
    return this.media.gigMedia(bandId, gigId);
  }

  private alreadyLinked() {
    return new ConflictException({
      code: FILES_ERROR_CODES.folderAlreadyLinked,
      message: "This folder is already another gig's folder",
    });
  }
}
