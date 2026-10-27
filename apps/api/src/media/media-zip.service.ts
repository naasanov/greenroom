import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ZipArchive } from "archiver";
import type { Response } from "express";
import { gigs, mediaItems, type Database } from "@greenroom/db";
import { MAX_ZIP_ITEMS } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { DriveStructureService } from "./drive-structure.service.js";
import { UUID_RE, contentDisposition } from "./media-util.js";

/** Splits "name.ext" into stem and extension (extension includes the dot). */
function splitName(name: string): [string, string] {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(name);
  return m ? [name.slice(0, -m[0].length), m[0]] : [name, ""];
}

/** Returns `name` or `name (2)`, `name (3)`... not yet in `used` (case-insensitive). */
export function dedupeName(name: string, used: Set<string>): string {
  const safe = name.replace(/[\\/\0]/g, "_") || "file";
  let candidate = safe;
  const [stem, ext] = splitName(safe);
  for (let n = 2; used.has(candidate.toLowerCase()); n++)
    candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Streams a zip of selected media items straight from Drive. */
@Injectable()
export class MediaZipService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
  ) {}

  async stream(bandId: string, idsParam: string, res: Response): Promise<void> {
    const ids = [...new Set(idsParam.split(",").map((s) => s.trim()))].filter(
      Boolean,
    );
    if (ids.length === 0 || ids.length > MAX_ZIP_ITEMS)
      throw new UnprocessableEntityException(
        `Select between 1 and ${MAX_ZIP_ITEMS} items`,
      );
    if (ids.some((id) => !UUID_RE.test(id)))
      throw new UnprocessableEntityException("Invalid item id");
    const items = await this.db
      .select()
      .from(mediaItems)
      .where(
        and(
          inArray(mediaItems.id, ids),
          eq(mediaItems.bandId, bandId),
          isNull(mediaItems.deletedAt),
          isNull(mediaItems.trashedAt),
        ),
      );
    if (items.length !== ids.length)
      throw new UnprocessableEntityException("Items must belong to this band");
    items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const ctx = await this.structure.requireContext(bandId);

    const gigIds = new Set(items.map((i) => i.gigId));
    let zipName = "Greenroom media.zip";
    if (gigIds.size === 1) {
      const [gig] = await this.db
        .select({ title: gigs.title })
        .from(gigs)
        .where(eq(gigs.id, [...gigIds][0]!));
      if (gig) zipName = `${gig.title} media.zip`;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      contentDisposition("attachment", zipName),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    const archive = new ZipArchive({ store: true });
    archive.on("error", () => res.destroy());
    res.on("close", () => archive.abort());
    archive.pipe(res);

    const used = new Set<string>();
    const missing: string[] = [];
    for (const item of items) {
      const dl = item.missing
        ? ({ status: "not-found" } as const)
        : await this.structure.drive.download(ctx.token, item.driveFileId);
      if (dl.status !== "ok") {
        missing.push(item.name);
        continue;
      }
      const entry = new Promise<void>((resolve) => {
        archive.once("entry", () => resolve());
        archive.once("error", () => resolve());
        res.once("close", () => resolve());
      });
      archive.append(dl.stream, { name: dedupeName(item.name, used) });
      await entry;
    }
    if (missing.length > 0) {
      archive.append(
        `These files could not be included because they are no longer in Google Drive:\n${missing.map((n) => `- ${n}`).join("\n")}\n`,
        { name: dedupeName("missing.txt", used) },
      );
    }
    await archive.finalize();
  }
}
