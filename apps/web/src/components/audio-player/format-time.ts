/** Formats milliseconds as m:ss, m:ss.t with tenths, or h:mm:ss at an hour or more. */
export function formatTime(ms: number, withTenths = false): string {
  const total = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const tenthsTotal = Math.floor(total / 100);
  const seconds = Math.floor(tenthsTotal / 10);
  const tenths = tenthsTotal % 10;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  const base =
    h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  return withTenths ? `${base}.${tenths}` : base;
}
