"use client";

import {
  AlertCircle,
  Check,
  FileText,
  FileVideo,
  ImageIcon,
  Music2,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { UploadEntry } from "./upload-store";

/** Rounded-rect outline that fills clockwise from the top-left as `fraction` grows. */
function ProgressBorder({
  fraction,
  tone,
}: {
  fraction: number;
  tone: "progress" | "done" | "error";
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      data-testid="upload-progress"
      data-progress={Math.round(fraction * 100)}
      className="pointer-events-none absolute inset-0 size-full"
    >
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="28"
        fill="none"
        pathLength={100}
        strokeWidth="4"
        strokeLinecap="butt"
        strokeDasharray="100"
        strokeDashoffset={100 - fraction * 100}
        className={cn(
          "transition-[stroke-dashoffset] duration-300 ease-linear",
          tone === "error" ? "stroke-destructive" : "stroke-blue-500",
        )}
      />
    </svg>
  );
}

function Preview({ entry }: { entry: UploadEntry }) {
  const [broken, setBroken] = useState(false);
  const url = entry.item?.thumbnailUrl ?? entry.previewUrl;
  const video = entry.mimeType.startsWith("video/");
  const Icon = video
    ? FileVideo
    : entry.mimeType === "application/pdf"
      ? FileText
      : entry.mimeType.startsWith("audio/")
        ? Music2
        : ImageIcon;
  if (url && !broken) {
    if (video && !entry.item?.thumbnailUrl) {
      return (
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className="size-full object-cover [image-orientation:from-image]"
      />
    );
  }
  return <Icon className="size-6" />;
}

export function UploadTile({
  entry,
  selected,
  editing,
  songTitle,
  onToggle,
  onStartRename,
  onRename,
  onRetry,
}: {
  entry: UploadEntry;
  selected: boolean;
  editing: boolean;
  songTitle: string | null;
  onToggle: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
  onRetry: () => void;
}) {
  const done = entry.status === "done";
  const fraction = done
    ? 1
    : entry.totalBytes
      ? entry.sent / entry.totalBytes
      : 0;
  const showBorder =
    done ||
    entry.status === "error" ||
    (entry.status === "uploading" && fraction > 0) ||
    (entry.status === "readd" && fraction > 0);
  return (
    <li
      data-testid="upload-tile"
      data-name={entry.fileName}
      data-status={entry.status}
      data-selected={selected}
      data-folder={entry.folderId ?? ""}
      data-song={entry.songId ?? ""}
      className={cn(
        "flex w-[4.5rem] shrink-0 flex-col transition-all duration-500",
        entry.flying && "-translate-y-16 opacity-0",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${entry.fileName}`}
        data-testid="upload-open"
        onClick={onToggle}
        className={cn(
          "relative size-[4.5rem] touch-manipulation rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          selected && "ring-3 ring-primary",
        )}
      >
        <div
          className={cn(
            "flex size-full items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground transition-[filter,opacity] duration-500",
            !done && "opacity-50 grayscale",
          )}
        >
          <Preview entry={entry} />
        </div>
        {showBorder ? (
          <ProgressBorder
            fraction={fraction}
            tone={
              entry.status === "error" ? "error" : done ? "done" : "progress"
            }
          />
        ) : null}
        {done ? (
          <span className="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : null}
        {entry.status === "readd" ? (
          <span
            data-testid="upload-readd"
            className="absolute inset-x-1 bottom-1 rounded-b-xl bg-black/65 px-2 py-0.5 text-center text-[9px] leading-tight font-medium text-white"
          >
            Re-add to finish
          </span>
        ) : null}
        {entry.status === "error" ? (
          <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-white">
            <AlertCircle className="size-3.5" />
          </span>
        ) : null}
        {entry.songId ? (
          <span
            data-testid="upload-song"
            className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
            title={songTitle ?? undefined}
          >
            <Music2 className="size-3" />
          </span>
        ) : null}
        {selected ? (
          <span
            className="absolute inset-0 rounded-2xl bg-primary/20"
            aria-hidden
          />
        ) : null}
      </button>
      {editing ? (
        <input
          autoFocus
          aria-label="Item name"
          data-testid="upload-name-input"
          defaultValue={entry.fileName}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => onRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onRename(null);
          }}
          className="relative z-10 h-11 w-44 min-w-0 rounded-md bg-muted px-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:text-xs"
        />
      ) : (
        <button
          type="button"
          data-testid="upload-name"
          onClick={onStartRename}
          className="flex min-h-11 w-full min-w-0 items-center px-1 text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="truncate">{entry.fileName}</span>
        </button>
      )}
      {entry.status === "error" ? (
        <div className="-mt-2 flex items-center gap-1 text-[10px] leading-tight text-destructive">
          <span data-testid="upload-error" className="line-clamp-2">
            {entry.error}
          </span>
          {entry.retryable ? (
            <button
              type="button"
              aria-label={`Retry ${entry.fileName}`}
              data-testid="upload-retry"
              onClick={onRetry}
              className="shrink-0"
            >
              <RotateCcw className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
