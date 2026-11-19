import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  GOOGLE_DRIVE,
  type DriveFile,
  type GoogleDriveAdapter,
} from "../integrations/index.js";
import { HeicConverterService } from "./heic-converter.service.js";
import {
  HEIC_MAX_BYTES,
  HEIC_MAX_PIXELS,
  heicDimensions,
  isHeic,
  jpegName,
} from "./heic-util.js";
import { readAll } from "./media-util.js";

export interface HeicConversion {
  /** The Drive file as it stands after the attempt; the live file whenever Drive could be read. */
  file: DriveFile;
  converted: boolean;
}

/**
 * Replaces a HEIC/HEIF Drive file with a JPEG in place: download, convert,
 * update the same file's bytes and name. Never throws; on any failure the
 * original stays as it was. One conversion runs at a time per process.
 */
@Injectable()
export class HeicConversionService {
  private readonly log = new Logger(HeicConversionService.name);
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(GOOGLE_DRIVE) private readonly drive: GoogleDriveAdapter,
    private readonly converter: HeicConverterService,
  ) {}

  /** `file` only needs to carry the id and mime type; Drive is re-read before converting. */
  convert(
    token: string,
    file: DriveFile,
    name: string = file.name,
  ): Promise<HeicConversion> {
    if (!isHeic(file.mimeType, name)) {
      return Promise.resolve({ file, converted: false });
    }
    const run = this.tail.then(() => this.convertNow(token, file));
    this.tail = run;
    return run;
  }

  private async convertNow(
    token: string,
    file: DriveFile,
  ): Promise<HeicConversion> {
    const unchanged = { file, converted: false };
    try {
      // Re-read so a file another pass already converted (or removed) is left alone.
      const live = await this.drive.getFile(token, file.id);
      if (live.status !== "ok" || live.file.trashed) return unchanged;
      const cur = live.file;
      if (!isHeic(cur.mimeType, cur.name))
        return { file: cur, converted: false };
      if (cur.size > HEIC_MAX_BYTES) {
        this.log.warn(`HEIC ${file.id} is ${cur.size} bytes; keeping original`);
        return { file: cur, converted: false };
      }
      const dl = await this.drive.download(token, cur.id);
      if (dl.status !== "ok") return { file: cur, converted: false };
      const data = await readAll(dl.stream);
      const dims = heicDimensions(data);
      if (!dims || dims.width * dims.height > HEIC_MAX_PIXELS) {
        this.log.warn(
          `HEIC ${file.id} is ${dims ? `${dims.width}x${dims.height}` : "of unknown size"}; keeping original`,
        );
        return { file: cur, converted: false };
      }
      const jpeg = await this.converter.toJpeg(data);
      const res = await this.drive.updateContent(token, cur.id, {
        name: await this.freeName(token, cur),
        mimeType: "image/jpeg",
        data: jpeg,
      });
      if (res.status !== "ok") return { file: cur, converted: false };
      return {
        file: {
          ...res.file,
          thumbnailLink: res.file.thumbnailLink ?? cur.thumbnailLink,
        },
        converted: true,
      };
    } catch (err) {
      this.log.warn(
        `HEIC conversion failed for ${file.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return unchanged;
    }
  }

  /** `<stem>.jpg`, with " (2)", " (3)"... when a sibling in the folder already has the name. */
  private async freeName(token: string, file: DriveFile): Promise<string> {
    const wanted = jpegName(file.name);
    if (!file.parentId) return wanted;
    let taken: Set<string>;
    try {
      const siblings = await this.drive.listChildren(token, file.parentId);
      taken = new Set(
        siblings.filter((s) => s.id !== file.id).map((s) => s.name),
      );
    } catch {
      return wanted;
    }
    if (!taken.has(wanted)) return wanted;
    const stem = wanted.slice(0, -".jpg".length);
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n}).jpg`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
