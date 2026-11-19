/** Parses `CHORDS_BANDS`: `*` or a comma-separated list of band ids or slugs. */
export function chordsEnabledFor(
  band: { id: string; slug: string },
  raw: string | undefined = process.env["CHORDS_BANDS"],
): boolean {
  const entries = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.includes("*")) return true;
  return (
    entries.includes(band.id.toLowerCase()) ||
    entries.includes(band.slug.toLowerCase())
  );
}
