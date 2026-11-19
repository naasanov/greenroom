import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { mediaItems, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import {
  GOOGLE_DRIVE,
  type GoogleDriveAdapter,
} from "../integrations/index.js";
import { HeicConversionService } from "./heic-conversion.service.js";
import { isHeic } from "./heic-util.js";
import { applyConvertedFile } from "./media-ingest.js";

export interface HeicBackfillResult {
  dryRun: boolean;
  /** Live HEIC items found. */
  found: number;
  /** Converted now, or already JPEG in Drive and brought up to date in the row. */
  converted: number;
  /** Found but left as they are: failed, too large, gone from Drive, or band not linked. */
  kept: number;
}

/**
 * Converts HEIC items already in media_items. Converted items no longer
 * match, so running it again only retries the ones that were kept.
 */
@Injectable()
export class HeicBackfillService {
  private readonly log = new Logger(HeicBackfillService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_DRIVE) private readonly drive: GoogleDriveAdapter,
    private readonly links: GoogleLinksService,
    private readonly heic: HeicConversionService,
  ) {}

  async run(opts: { dryRun?: boolean; bandId?: string } = {}) {
    const dryRun = opts.dryRun ?? false;
    const rows = (
      await this.db
        .select()
        .from(mediaItems)
        .where(
          and(
            isNull(mediaItems.deletedAt),
            isNull(mediaItems.trashedAt),
            eq(mediaItems.missing, false),
            opts.bandId ? eq(mediaItems.bandId, opts.bandId) : undefined,
            or(
              sql`lower(${mediaItems.mimeType}) like 'image/he%'`,
              sql`lower(${mediaItems.mimeType}) like 'image/x-he%'`,
              sql`${mediaItems.name} ~* '\\.(heic|heif)$'`,
            ),
          ),
        )
        .orderBy(mediaItems.bandId, mediaItems.createdAt)
    ).filter((r) => isHeic(r.mimeType, r.name));
    const result: HeicBackfillResult = {
      dryRun,
      found: rows.length,
      converted: 0,
      kept: 0,
    };
    if (dryRun) return result;
    const tokens = new Map<string, string | null>();
    for (const row of rows) {
      let token = tokens.get(row.bandId);
      if (token === undefined) {
        token = await this.links.getAccessToken(row.bandId, "drive");
        tokens.set(row.bandId, token);
      }
      if (!token || !(await this.convertRow(token, row))) result.kept++;
      else result.converted++;
    }
    this.log.log(`HEIC backfill: ${JSON.stringify(result)}`);
    return result;
  }

  private async convertRow(
    token: string,
    row: typeof mediaItems.$inferSelect,
  ): Promise<boolean> {
    try {
      const live = await this.drive.getFile(token, row.driveFileId);
      if (live.status !== "ok" || live.file.trashed) return false;
      const res = await this.heic.convert(token, live.file);
      // A file already turned into a JPEG (a retry or another pass) only needs its row updated.
      const repaired =
        !res.converted && !isHeic(res.file.mimeType, res.file.name);
      if (!res.converted && !repaired) return false;
      await applyConvertedFile(this.db, row.bandId, res.file);
      return true;
    } catch (err) {
      this.log.warn(`HEIC backfill failed for ${row.id}: ${String(err)}`);
      return false;
    }
  }
}
