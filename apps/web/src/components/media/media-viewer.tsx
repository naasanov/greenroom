"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Music2,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import { downloadUrl, shareItems, useShareSheet } from "./media-download";
import { MediaThumb, isVideo } from "./media-tile";

const SWIPE_PX = 50;

function Content({ item }: { item: MediaItem }) {
  const [broken, setBroken] = useState(false);
  if (item.missing) {
    return (
      <div className="size-48 overflow-hidden rounded-2xl">
        <MediaThumb item={item} />
      </div>
    );
  }
  if (isVideo(item)) {
    return (
      <video
        key={item.id}
        data-testid="viewer-video"
        src={item.contentUrl}
        poster={item.thumbnailUrl ?? undefined}
        controls
        playsInline
        crossOrigin="use-credentials"
        className="max-h-full max-w-full"
      />
    );
  }
  if (broken && item.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        data-testid="viewer-image"
        src={item.thumbnailUrl}
        alt={item.name}
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={item.id}
      data-testid="viewer-image"
      src={item.contentUrl}
      alt={item.name}
      onError={() => setBroken(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/** Full-screen viewer over the gallery; swipe, arrow buttons or arrow keys step through items. */
export function MediaViewer({
  items,
  index,
  songTitle,
  onIndexChange,
  onClose,
  onLinkSong,
  onClearSong,
}: {
  items: MediaItem[];
  index: number;
  songTitle: (item: MediaItem) => string | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onLinkSong: (item: MediaItem) => void;
  onClearSong: (item: MediaItem) => void;
}) {
  const item = items[index];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const canShare = useShareSheet("files");

  const last = items.length - 1;
  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next <= last) onIndexChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Dialogs and drawers above the viewer own the keyboard.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"]',
        )
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // The viewed item vanished (deleted); leave the viewer.
  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);
  if (!item) return null;

  const song = songTitle(item);
  return (
    <div
      role="region"
      aria-label="Media viewer"
      data-testid="media-viewer"
      className="fixed inset-0 z-[45] flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close viewer"
          onClick={onClose}
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <X />
        </Button>
        <div className="min-w-0 flex-1">
          <p data-testid="viewer-name" className="truncate text-sm font-medium">
            {item.name}
          </p>
          <p
            data-testid="viewer-position"
            className="text-xs text-white/60 tabular-nums"
          >
            {index + 1} of {items.length}
          </p>
        </div>
        {canShare && !item.missing ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share"
            data-testid="viewer-share"
            onClick={() => void shareItems([item])}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Share2 />
          </Button>
        ) : null}
        {!item.missing ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <a
              aria-label="Download"
              data-testid="viewer-download"
              href={downloadUrl(item)}
              download={item.name}
            >
              <Download />
            </a>
          </Button>
        ) : null}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          const o = touch.current;
          touch.current = null;
          if (!t || !o) return;
          const dx = t.clientX - o.x;
          if (
            Math.abs(dx) > SWIPE_PX &&
            Math.abs(dx) > Math.abs(t.clientY - o.y)
          ) {
            go(dx < 0 ? 1 : -1);
          }
        }}
      >
        <Content key={item.id} item={item} />
        {index > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous item"
            data-testid="viewer-prev"
            onClick={() => go(-1)}
            className="absolute left-2 hidden bg-black/40 text-white hover:bg-white/20 hover:text-white md:flex"
          >
            <ChevronLeft />
          </Button>
        ) : null}
        {index < last ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next item"
            data-testid="viewer-next"
            onClick={() => go(1)}
            className="absolute right-2 hidden bg-black/40 text-white hover:bg-white/20 hover:text-white md:flex"
          >
            <ChevronRight />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-2 px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {song ? (
          <>
            <span
              data-testid="viewer-song"
              className="flex min-w-0 items-center gap-1.5 text-sm"
            >
              <Music2 className="size-4 shrink-0" />
              <span className="truncate">{song}</span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onLinkSong(item)}
            >
              Change song
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onClearSong(item)}
            >
              Clear song
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onLinkSong(item)}
          >
            <Music2 /> Link to song
          </Button>
        )}
      </div>
    </div>
  );
}
