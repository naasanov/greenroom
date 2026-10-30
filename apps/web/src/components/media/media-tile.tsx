"use client";

import {
  Check,
  FileQuestion,
  FileVideo,
  ImageIcon,
  Music2,
  Play,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useRef, useState, type PointerEvent } from "react";
import type { MediaItem } from "@greenroom/shared";
import { cn } from "@/lib/utils";

export type Density = "large" | "compact" | "names";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export const isVideo = (item: MediaItem) =>
  !!item.mimeType?.startsWith("video/");

/** Thumbnail image, missing placeholder, or a type icon; fills its parent. */
export function MediaThumb({
  item,
  className,
  compact,
}: {
  item: MediaItem;
  className?: string;
  compact?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const base = cn(
    "relative flex size-full items-center justify-center overflow-hidden bg-muted text-muted-foreground",
    className,
  );
  if (item.missing) {
    return (
      <div
        data-testid="media-missing"
        className={cn(base, "flex-col gap-1 p-1 text-center leading-tight")}
      >
        <FileQuestion className={compact ? "size-4" : "size-6"} />
        <span className={compact ? "text-[9px]" : "text-xs"}>
          No longer in Drive
        </span>
      </div>
    );
  }
  const Icon = isVideo(item) ? FileVideo : ImageIcon;
  const noThumb = !item.thumbnailUrl || broken;
  return (
    <div className={base}>
      {noThumb && isVideo(item) && !videoBroken ? (
        // A frame from the file itself when Drive has no thumbnail for the video.
        <video
          data-testid="media-video-frame"
          src={`${item.contentUrl}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          crossOrigin="use-credentials"
          onError={() => setVideoBroken(true)}
          className="size-full object-cover"
        />
      ) : item.thumbnailUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="media-thumb"
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="size-full object-cover [image-orientation:from-image]"
        />
      ) : (
        <Icon className="size-6" />
      )}
      {isVideo(item) ? (
        <span
          data-testid="media-play-badge"
          className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <Play className="size-3 fill-current" />
        </span>
      ) : null}
    </div>
  );
}

/** Trailing circle for list rows in selection mode; fills when selected. */
function RowCheck({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="row-check"
      data-checked={selected}
      className={cn(
        "mr-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/50 text-transparent",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

function SelectMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full border-2 transition-opacity",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/80 bg-black/20 text-transparent",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

/** Tap, or long-press to start a selection (the click that follows is swallowed). */
function usePressHandlers(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    /** True once (and clears) when the click belongs to a long press. */
    consumeLongPress: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e: PointerEvent) => {
        const o = origin.current;
        if (
          o &&
          Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE_PX
        ) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
  };
}

function NameEditor({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const settled = useRef(false);
  const finish = (value: string | null) => {
    if (settled.current) return;
    settled.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      aria-label="Item name"
      data-testid="media-name-input"
      defaultValue={initial}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      className="relative z-10 h-11 w-full min-w-0 rounded-md bg-muted px-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:text-xs"
    />
  );
}

export interface TileProps {
  item: MediaItem;
  density: Density;
  selected: boolean;
  selecting: boolean;
  songTitle: string | null;
  editing: boolean;
  onActivate: () => void;
  onLongPress: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
  /** Ids a drag from this tile carries (the whole selection when selected). */
  dragCount?: number;
}

/** One gallery item: thumbnail (tap opens or toggles) and a name label (tap renames). */
export function MediaTile(props: TileProps) {
  const { item, density, selected, selecting, songTitle, editing } = props;
  const press = usePressHandlers(props.onLongPress);
  const drag = useDraggable({
    id: item.id,
    disabled: editing,
    data: { count: props.dragCount ?? 1 },
  });
  // Mouse only: touch keeps scrolling and long-press selection.
  const dragProps = {
    ref: drag.setNodeRef,
    onMouseDown: drag.listeners?.onMouseDown as
      ((e: React.MouseEvent) => void) | undefined,
  };
  const activate = () => {
    if (press.consumeLongPress()) return;
    props.onActivate();
  };

  if (density === "names") {
    return (
      <li
        data-testid="media-tile"
        data-name={item.name}
        data-selected={selected}
        className={cn(
          "flex items-center gap-3 rounded-xl px-1.5 py-1",
          selected && "bg-primary/10",
          drag.isDragging && "opacity-40",
        )}
      >
        <button
          type="button"
          aria-pressed={selecting ? selected : undefined}
          aria-label={`${selecting ? "Select" : "Open"} ${item.name}`}
          data-testid="media-open"
          onClick={activate}
          {...press.handlers}
          {...dragProps}
          className="relative size-11 shrink-0 touch-manipulation overflow-hidden rounded-lg select-none [-webkit-touch-callout:none]"
        >
          <MediaThumb item={item} compact />
        </button>
        {editing ? (
          <div className="min-w-0 flex-1">
            <NameEditor initial={item.name} onDone={props.onRename} />
          </div>
        ) : (
          <button
            type="button"
            data-testid="media-name"
            onClick={() => {
              if (press.consumeLongPress()) return;
              if (selecting) props.onActivate();
              else props.onStartRename();
            }}
            {...press.handlers}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left select-none [-webkit-touch-callout:none]"
          >
            <span className="truncate text-sm">{item.name}</span>
            {songTitle ? (
              <span
                data-testid="media-song"
                className="flex items-center gap-1 truncate text-xs text-muted-foreground"
              >
                <Music2 className="size-3 shrink-0" />
                {songTitle}
              </span>
            ) : null}
          </button>
        )}
        {selecting ? <RowCheck selected={selected} /> : null}
      </li>
    );
  }

  return (
    <li
      data-testid="media-tile"
      data-name={item.name}
      data-selected={selected}
      className={cn("flex min-w-0 flex-col", drag.isDragging && "opacity-40")}
    >
      <button
        type="button"
        aria-pressed={selecting ? selected : undefined}
        aria-label={`${selecting ? "Select" : "Open"} ${item.name}`}
        data-testid="media-open"
        onClick={activate}
        {...press.handlers}
        {...dragProps}
        className={cn(
          "relative aspect-square w-full touch-manipulation overflow-hidden rounded-2xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-touch-callout:none]",
          selected && "ring-3 ring-primary",
        )}
      >
        <MediaThumb item={item} compact={density === "compact"} />
        {selecting ? <SelectMark selected={selected} /> : null}
        {selected ? (
          <span className="absolute inset-0 bg-primary/20" aria-hidden />
        ) : null}
      </button>
      {editing ? (
        <NameEditor initial={item.name} onDone={props.onRename} />
      ) : (
        <button
          type="button"
          data-testid="media-name"
          onClick={props.onStartRename}
          className="flex min-h-11 w-full min-w-0 items-center px-1 text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="truncate">{item.name}</span>
        </button>
      )}
      {songTitle ? (
        <span
          data-testid="media-song"
          className="-mt-2 mb-1 flex items-center gap-1 truncate px-1 text-[11px] text-muted-foreground"
        >
          <Music2 className="size-3 shrink-0" />
          <span className="truncate">{songTitle}</span>
        </span>
      ) : null}
    </li>
  );
}
