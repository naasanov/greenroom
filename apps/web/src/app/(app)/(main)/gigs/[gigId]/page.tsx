import type { Metadata } from "next";
import { gigPreview } from "@/lib/link-preview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gigId: string }>;
}): Promise<Metadata> {
  return gigPreview((await params).gigId);
}

// Rendered by the Events tab host in RoutedShell, which opens this gig's drawer.
export default function GigLinkPage() {
  return null;
}
