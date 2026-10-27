"use client";

import { FileQuestion, FileVideo, ImageIcon } from "lucide-react";
import type { GigMedia, MediaItem } from "@greenroom/shared";
import { DriveLinkPrompt } from "@/components/google/drive-link-prompt";
import { useGoogleIntegrations } from "@/lib/queries/google";
import { useGigMedia } from "@/lib/queries/media";
import { useRouter } from "next/navigation";
import { openMediaView } from "./media-gallery-page";

const PREVIEW_COUNT = 4;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function countsLabel({ photos, videos, other }: GigMedia["counts"]) {
  const parts: string[] = [];
  if (photos) parts.push(plural(photos, "photo", "photos"));
  if (videos) parts.push(plural(videos, "video", "videos"));
  if (other) parts.push(plural(other, "other file", "other files"));
  return parts.join(", ");
}

function recentItems(media: GigMedia): MediaItem[] {
  return [...media.folders.flatMap((f) => f.items), ...media.unsorted]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PREVIEW_COUNT);
}

function Thumb({ item }: { item: MediaItem }) {
  const tile =
    "flex aspect-square min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground";
  if (item.missing) {
    return (
      <div
        data-testid="media-missing"
        className={`${tile} flex-col gap-1 p-1 text-center text-[10px] leading-tight`}
      >
        <FileQuestion className="size-5" />
        No longer in Drive
      </div>
    );
  }
  if (!item.thumbnailUrl) {
    const Icon = item.mimeType?.startsWith("video/") ? FileVideo : ImageIcon;
    return (
      <div className={tile} title={item.name}>
        <Icon className="size-5" />
      </div>
    );
  }
  return (
    <div className={tile}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-testid="media-thumb"
        src={item.thumbnailUrl}
        alt={item.name}
        loading="lazy"
        className="size-full object-cover"
      />
    </div>
  );
}

/** Gig drawer Media section: link prompt, empty state, or a recent-media preview. */
export function MediaSection({
  bandId,
  gigId,
}: {
  bandId: string;
  gigId: string;
}) {
  const router = useRouter();
  const media = useGigMedia(bandId, gigId);
  const integrations = useGoogleIntegrations(bandId);
  const data = media.data;
  const drive = integrations.data?.drive;
  const ready = !!data?.driveLinked && !!drive?.folderId;

  let body;
  if (!data || !drive) {
    body = null;
  } else if (!ready) {
    body = <DriveLinkPrompt bandId={bandId} />;
  } else {
    const total = data.counts.photos + data.counts.videos + data.counts.other;
    if (total === 0) {
      body = (
        <p
          data-testid="media-empty"
          className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground"
        >
          No media yet
        </p>
      );
    } else {
      const inner = (
        <>
          <div className="flex gap-2">
            {recentItems(data).map((item) => (
              <Thumb key={item.id} item={item} />
            ))}
          </div>
          <p
            data-testid="media-counts"
            className="text-sm text-muted-foreground"
          >
            {countsLabel(data.counts)}
          </p>
        </>
      );
      body = (
        <button
          type="button"
          data-testid="media-strip"
          onClick={() => openMediaView(router, gigId)}
          className="flex flex-col gap-2 text-left"
        >
          {inner}
        </button>
      );
    }
  }

  return (
    <section
      data-testid="media-section"
      aria-labelledby="gig-media-heading"
      className="flex flex-col gap-3"
    >
      <h3 id="gig-media-heading" className="text-base font-semibold">
        Media
      </h3>
      {body}
    </section>
  );
}
