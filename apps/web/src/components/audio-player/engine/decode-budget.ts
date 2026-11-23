export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_DECODED_BYTES = 450 * 1024 * 1024;

/** Rough decoded PCM size multiplier for a mime type (lossy and unknown are the worst case). */
function expansionFactor(mimeType: string | null): number {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("wav") || mime.includes("wave") || mime.includes("aiff"))
    return 2;
  if (mime.includes("flac")) return 4;
  return 22;
}

export function estimateDecodedBytes(
  sizeBytes: number,
  mimeType: string | null,
): number {
  return sizeBytes * expansionFactor(mimeType);
}

/** True when the file is too big to decode safely; null size is treated as unknown (fits). */
export function exceedsDecodeBudget(
  sizeBytes: number | null,
  mimeType: string | null,
): boolean {
  if (sizeBytes === null || !Number.isFinite(sizeBytes)) return false;
  return (
    sizeBytes > MAX_FILE_BYTES ||
    estimateDecodedBytes(sizeBytes, mimeType) > MAX_DECODED_BYTES
  );
}
