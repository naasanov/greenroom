/** Parses `m:ss.t`, `m:ss`, `ss.t` or plain seconds into milliseconds; null when invalid. */
export function parseTime(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length > 3) return null;
  const num = /^\d+(\.\d+)?$/;
  if (!parts.every((p) => num.test(p))) return null;
  // Only the last part may carry a fraction.
  if (parts.slice(0, -1).some((p) => p.includes("."))) return null;
  const secs = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  if (parts.length > 1 && Number(parts[parts.length - 1]) >= 60) return null;
  return Math.round(secs * 1000);
}
