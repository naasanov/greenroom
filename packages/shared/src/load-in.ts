/** Load-in is the previous calendar day when its clock time is later than the start time. */
export function loadInIsDayBefore(
  startTime: string | null | undefined,
  loadInTime: string | null | undefined,
): boolean {
  return !!startTime && !!loadInTime && loadInTime > startTime;
}

/** Calendar date (`YYYY-MM-DD`) of the load-in for a gig on `date`. */
export function loadInDate(
  date: string,
  startTime: string | null | undefined,
  loadInTime: string | null | undefined,
): string {
  if (!loadInIsDayBefore(startTime, loadInTime)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
