"use client";

import { useParams } from "next/navigation";
import { GigLinkView } from "@/components/onboarding/deep-link-views";

export default function GigLinkPage() {
  const { gigId } = useParams<{ gigId: string }>();
  return <GigLinkView gigId={gigId} />;
}
