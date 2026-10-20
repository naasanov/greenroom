"use client";

import { Check, GripVertical, Music } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { toneFor } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

/** Square art with a graceful placeholder when there is no image. */
export function Thumbnail({
  src,
  seed,
  icon,
  className,
}: {
  src?: string | null;
  /** Picks the placeholder tint; usually the title. */
  seed: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl",
        !src && toneFor(seed),
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        (icon ?? <Music className="size-6 opacity-70" />)
      )}
    </span>
  );
}

/**
 * Spotify-playlist style row: art, title, subtitle, trailing meta, with an
 * optional drag handle and check state. Looks right with only a title.
 */
export function ListCard({
  title,
  subtitle,
  meta,
  thumbnail,
  thumbnailIcon,
  draggable: showHandle,
  handleProps,
  checked,
  selected,
  onClick,
  trailing,
  className,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  thumbnail?: string | null;
  thumbnailIcon?: ReactNode;
  /** Shows a leading drag handle (wire `handleProps` to dnd-kit later). */
  draggable?: boolean;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
  /** true/false renders a check circle; undefined renders none. */
  checked?: boolean;
  selected?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      data-testid="list-card"
      data-selected={selected || undefined}
      className={cn(
        "flex min-h-[4.75rem] items-center gap-1 rounded-2xl border bg-card p-2 shadow-soft transition-colors",
        interactive && "hover:bg-accent/50",
        selected && "border-primary/60 bg-gig-soft/60 ring-1 ring-primary/40",
        className,
      )}
    >
      {showHandle ? (
        <button
          type="button"
          aria-label="Drag to reorder"
          {...handleProps}
          className={cn(
            "flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/70 outline-none active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-ring/50",
            handleProps?.className,
          )}
        >
          <GripVertical className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
      >
        <Thumbnail src={thumbnail} seed={title} icon={thumbnailIcon} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[0.95rem] leading-snug font-semibold">
            {title}
          </span>
          {subtitle ? (
            <span className="truncate text-sm text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
        {meta ? (
          <span className="shrink-0 pl-2 text-sm text-muted-foreground tabular-nums">
            {meta}
          </span>
        ) : null}
      </button>
      {trailing}
      {checked !== undefined ? (
        <span
          role="img"
          aria-label={checked ? "Added" : "Not added"}
          data-checked={checked}
          className={cn(
            "mr-1 ml-1 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30",
          )}
        >
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
      ) : null}
    </div>
  );
}
