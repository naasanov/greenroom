const UUID_TAIL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLUG = 40;

/** `<title-slug>-<uuid>`; just the uuid when the title has no ascii letters or digits. */
export function gigSlugId(gig: { id: string; title: string }): string {
  const slug = gig.title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return slug ? `${slug}-${gig.id}` : gig.id;
}

/** Extracts the trailing uuid from a route param; returns the param when none is found. */
export function parseGigId(param: string): string {
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    // Keep the raw param.
  }
  return UUID_TAIL.exec(decoded)?.[0] ?? param;
}
