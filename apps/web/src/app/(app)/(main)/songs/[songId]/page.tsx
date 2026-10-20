"use client";

import { useParams } from "next/navigation";
import { SongLinkView } from "@/components/onboarding/deep-link-views";

export default function SongLinkPage() {
  const { songId } = useParams<{ songId: string }>();
  return <SongLinkView songId={songId} />;
}
