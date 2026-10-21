"use client";

import { useParams } from "next/navigation";
import { SongLinkView } from "@/components/library/song-link-view";

export default function SongLinkPage() {
  const { songId } = useParams<{ songId: string }>();
  return <SongLinkView songId={songId} />;
}
