// Fixed UUIDs: the first group names the entity kind, the last group is the index.
const kinds = {
  user: 1,
  band: 2,
  membership: 3,
  gig: 4,
  song: 5,
  setlist: 6,
  practice: 7,
  folder: 8,
} as const;

export function fixedId(kind: keyof typeof kinds, n: number): string {
  const k = String(kinds[kind]).padStart(8, "0");
  return `${k}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
