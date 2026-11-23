export const PEAK_BUCKETS = 1000;

/**
 * Per-bucket RMS loudness across all channels, normalized so the loudest bucket is 1.
 * Silent input yields all zeros.
 */
export function computePeaks(
  channels: Float32Array[],
  buckets: number = PEAK_BUCKETS,
): Float32Array {
  const out = new Float32Array(buckets);
  const length = channels[0]?.length ?? 0;
  if (length === 0 || channels.length === 0) return out;

  let max = 0;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * length) / buckets);
    const end = Math.max(start + 1, Math.floor(((b + 1) * length) / buckets));
    let sum = 0;
    let count = 0;
    for (const ch of channels) {
      for (let i = start; i < end && i < ch.length; i++) {
        const v = ch[i]!;
        sum += v * v;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    out[b] = rms;
    if (rms > max) max = rms;
  }
  if (max > 0) for (let b = 0; b < buckets; b++) out[b] = out[b]! / max;
  return out;
}
