import { Injectable } from "@nestjs/common";

const JPEG_QUALITY = 0.9;

type ConvertFn = (typeof import("heic-convert"))["default"];

/**
 * Decodes HEIC/HEIF bytes and re-encodes them as JPEG. Pure JS and WASM
 * (libheif-js), so it runs on Alpine without native libraries. The decoder
 * applies the image's rotation and mirror boxes; EXIF is not carried over.
 * The library is imported on first use so the WASM is not compiled at boot.
 */
@Injectable()
export class HeicConverterService {
  private lib: Promise<ConvertFn> | null = null;

  async toJpeg(input: Buffer): Promise<Buffer> {
    const convert = await this.load();
    const out = await convert({
      buffer: input,
      format: "JPEG",
      quality: JPEG_QUALITY,
    });
    return Buffer.from(out);
  }

  private load(): Promise<ConvertFn> {
    if (!this.lib) {
      const loading = import("heic-convert").then((m) => m.default);
      loading.catch(() => {
        this.lib = null;
      });
      this.lib = loading;
    }
    return this.lib;
  }
}
