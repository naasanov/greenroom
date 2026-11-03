"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { NoAccess } from "@/components/onboarding/deep-link-views";
import { useCurrentBand } from "@/lib/current-band";
import { useGig } from "@/lib/queries";
import { gigPath, mediaPath, parseGigId } from "@/lib/gig-path";
import { useGigLinkFor } from "@/lib/queries/events";
import { MediaGallery } from "./media-gallery";

/** Set when the app itself navigated here, so closing can pop history instead of pushing. */
let openedInApp = false;

export function openMediaView(
  router: { push: (href: string) => void },
  gig: string | { id: string; title: string },
) {
  openedInApp = true;
  const target =
    typeof gig === "string" ? { id: parseGigId(gig), title: "" } : gig;
  router.push(
    typeof gig === "string" ? mediaPath(gig) : gigPath(target, "/media"),
  );
}

/** Route body for /gigs/:gigId/media: resolves the gig's band (switching to it once) and shows the gallery. */
export function MediaGalleryPage({ gigId: param }: { gigId: string }) {
  const gigId = parseGigId(param);
  const router = useRouter();
  const { currentBand, setCurrentBandId } = useCurrentBand();
  const link = useGigLinkFor(gigId);
  const bandId = link.data?.bandId;
  const gig = useGig(bandId, gigId);

  const adopted = useRef(false);
  useEffect(() => {
    if (!bandId || adopted.current) return;
    adopted.current = true;
    if (currentBand?.id !== bandId) setCurrentBandId(bandId);
  }, [bandId, currentBand?.id, setCurrentBandId]);

  if (link.isError) return <NoAccess error={link.error} tab="events" />;
  if (!bandId) return null;

  const leave = () => {
    if (openedInApp) {
      openedInApp = false;
      router.back();
    } else {
      router.replace(gigPath({ id: gigId, title: gig.data?.title ?? "" }));
    }
  };

  return (
    <MediaGallery
      bandId={bandId}
      gigId={gigId}
      gigTitle={gig.data?.title}
      onClose={leave}
    />
  );
}
