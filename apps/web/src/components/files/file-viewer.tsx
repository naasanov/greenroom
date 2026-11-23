"use client";

import {
  Download,
  ExternalLink,
  FileQuestion,
  HardDrive,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { FileEntry } from "@greenroom/shared";
import { AudioPlayer } from "@/components/audio-player/audio-player";
import { startDownload } from "@/components/media/media-download";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { filesContentUrl } from "@/lib/queries/files";
import { driveOpenUrl, isGoogleDoc, previewKind } from "./file-utils";

/** Full-screen preview: image, video, audio and PDF inline, anything else downloads. */
export function FileViewer({
  bandId,
  entry,
  onClose,
}: {
  bandId: string;
  entry: FileEntry;
  onClose: () => void;
}) {
  const kind = previewKind(entry);
  const src = filesContentUrl(bandId, entry.id);
  const canDownload = !isGoogleDoc(entry);
  const download = () =>
    startDownload(filesContentUrl(bandId, entry.id, true), entry.name);

  const escapeRef = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // An open select listbox closes itself; the player may consume Escape first.
      if (e.target instanceof Element && e.target.closest('[role="listbox"]'))
        return;
      if (escapeRef.current?.()) {
        e.stopImmediatePropagation();
        return;
      }
      // Window capture runs before any sheet or drawer Escape handler.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
      data-testid="file-viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
    >
      <div className="pt-safe flex items-center gap-2 px-3">
        <p className="min-w-0 flex-1 truncate py-3 text-sm font-medium">
          {entry.name}
        </p>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <a
            href={driveOpenUrl(entry)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in Drive"
            data-testid="viewer-drive-link"
          >
            <HardDrive />
          </a>
        </Button>
        {canDownload ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Download"
            onClick={download}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Download />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close viewer"
          onClick={onClose}
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <X />
        </Button>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 p-3 pb-safe",
          kind === "audio" ? "flex-col" : "items-center justify-center",
        )}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="viewer-image"
            src={src}
            alt={entry.name}
            className="max-h-full max-w-full object-contain [image-orientation:from-image]"
          />
        ) : kind === "video" ? (
          <video
            data-testid="viewer-video"
            src={src}
            controls
            playsInline
            crossOrigin="use-credentials"
            className="max-h-full max-w-full"
          />
        ) : kind === "audio" ? (
          <AudioPlayer bandId={bandId} entry={entry} escapeRef={escapeRef} />
        ) : kind === "pdf" ? (
          <iframe
            data-testid="viewer-pdf"
            title={entry.name}
            src={src}
            className="size-full rounded-lg bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileQuestion className="size-12 opacity-70" />
            <p className="text-sm">
              {canDownload
                ? "No preview for this file type."
                : "This Google document opens in Google Drive."}
            </p>
            {canDownload ? (
              <Button variant="secondary" onClick={download}>
                <Download /> Download
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <a
                  href={driveOpenUrl(entry)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="viewer-open-drive"
                  onClick={onClose}
                >
                  <ExternalLink /> Open in Google Drive
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
