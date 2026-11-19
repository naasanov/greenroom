declare module "heic-convert" {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    /** 0 to 1, JPEG only. */
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
