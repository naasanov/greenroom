"use client";

import { useParams } from "next/navigation";
import { MediaGalleryPage } from "@/components/media/media-gallery-page";

export default function GigMediaPage() {
  const { gigId } = useParams<{ gigId: string }>();
  return <MediaGalleryPage gigId={gigId} />;
}
