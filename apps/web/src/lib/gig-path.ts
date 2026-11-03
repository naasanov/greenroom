import { gigSlugId, parseGigId } from "@greenroom/shared";

export { gigSlugId, parseGigId };

/** `/gigs/<title-slug>-<uuid>` plus an optional suffix such as `/stage`. */
export function gigPath(
  gig: { id: string; title: string },
  suffix = "",
): string {
  return `/gigs/${gigSlugId(gig)}${suffix}`;
}

/** The full-screen media view; accepts a bare id or an id with slug. */
export function mediaPath(gigId: string): string {
  return `/gigs/${gigId}/media`;
}
