"use client";

import {
  CalendarDays,
  File as FileIcon,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderClock,
  ImageIcon,
} from "lucide-react";
import { useState } from "react";
import type { FileEntry } from "@greenroom/shared";
import { filesThumbnailUrl } from "@/lib/queries/files";
import { cn } from "@/lib/utils";

function TypeIcon({
  mime,
  className,
}: {
  mime: string | null;
  className?: string;
}) {
  const m = mime ?? "";
  const props = { "aria-hidden": true, className } as const;
  if (m.startsWith("image/")) return <ImageIcon {...props} />;
  if (m.startsWith("video/")) return <FileVideo {...props} />;
  if (m.startsWith("audio/")) return <FileAudio {...props} />;
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv")
    return <FileSpreadsheet {...props} />;
  if (
    m === "application/pdf" ||
    m.startsWith("text/") ||
    m.includes("document")
  )
    return <FileText {...props} />;
  return <FileIcon {...props} />;
}

/** Drive-style folder; gigs root and gig folders get their own marks. */
export function FolderGlyph({
  entry,
  className,
}: {
  entry: FileEntry;
  className?: string;
}) {
  if (entry.isGigsRoot) {
    return (
      <FolderClock
        aria-hidden
        data-testid="gigs-root-icon"
        className={cn("fill-primary/25 text-primary", className)}
      />
    );
  }
  if (entry.gig) {
    return (
      <span
        aria-hidden
        data-testid="gig-folder-icon"
        className={cn("relative inline-flex", className)}
      >
        <Folder className="size-full fill-primary/25 text-primary" />
        <span className="absolute -right-0.5 -bottom-0.5 flex size-[45%] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
          <CalendarDays className="size-[65%]" />
        </span>
      </span>
    );
  }
  return (
    <Folder
      aria-hidden
      data-testid="folder-icon"
      className={cn(
        "fill-muted-foreground/25 text-muted-foreground",
        className,
      )}
    />
  );
}

/** A square preview: thumbnail when Drive has one, otherwise the type icon. */
export function FilePreview({
  bandId,
  entry,
  iconClassName,
  className,
}: {
  bandId: string;
  entry: FileEntry;
  iconClassName?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = entry.thumbnailAvailable && !broken;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="file-thumb"
          src={filesThumbnailUrl(bandId, entry.id)}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover [image-orientation:from-image]"
        />
      ) : (
        <TypeIcon
          mime={entry.mimeType}
          className={cn("size-5", iconClassName)}
        />
      )}
    </span>
  );
}

/** Leading visual for an entry: folder glyph or file preview. */
export function EntryVisual({
  bandId,
  entry,
  size,
}: {
  bandId: string;
  entry: FileEntry;
  size: "row" | "tile";
}) {
  if (entry.kind === "folder") {
    return (
      <FolderGlyph
        entry={entry}
        className={size === "row" ? "size-9" : "size-16"}
      />
    );
  }
  return (
    <FilePreview
      bandId={bandId}
      entry={entry}
      className={size === "row" ? "size-9 rounded-lg" : "size-full"}
      iconClassName={size === "row" ? "size-5" : "size-10"}
    />
  );
}
