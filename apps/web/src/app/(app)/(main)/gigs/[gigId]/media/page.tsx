"use client";

import { parseGigId } from "@/lib/gig-path";
import { useParams } from "next/navigation";
import { MediaGalleryPage } from "@/components/media/media-gallery-page";

export default function GigMediaPage() {
  const { gigId } = useParams<{ gigId: string }>();
  return <MediaGalleryPage gigId={parseGigId(gigId)} />;
}
