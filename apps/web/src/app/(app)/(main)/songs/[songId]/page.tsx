import type { Metadata } from "next";
import { SongLinkView } from "@/components/library/song-link-view";
import { songPreview } from "@/lib/link-preview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ songId: string }>;
}): Promise<Metadata> {
  return songPreview((await params).songId);
}

export default async function SongLinkPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  return <SongLinkView songId={songId} />;
}
