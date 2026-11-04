"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FileEntry } from "@greenroom/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EntryVisual } from "./file-icon";
import {
  entryHref,
  formatGigDate,
  formatModified,
  formatSize,
} from "./file-utils";
import { ItemMenu, type EntryActions } from "./item-menu";

export interface EntryProps {
  bandId: string;
  entry: FileEntry;
  selecting: boolean;
  selected: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onToggle: () => void;
  onOpenFile: (entry: FileEntry) => void;
  actions: EntryActions;
}

const displayName = (e: FileEntry) => e.gig?.title ?? e.name;

/** The tappable part of an entry: toggles in selection mode, else navigates or opens. */
function Activator({
  entry,
  selecting,
  selected,
  onToggle,
  onOpenFile,
  className,
  children,
}: Pick<
  EntryProps,
  "entry" | "selecting" | "selected" | "onToggle" | "onOpenFile"
> & { className?: string; children: ReactNode }) {
  const name = displayName(entry);
  const base = cn(
    "min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    className,
  );
  if (selecting) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${name}`}
        onClick={onToggle}
        className={base}
      >
        {children}
      </button>
    );
  }
  const href = entryHref(entry);
  if (href) {
    return (
      <Link href={href} aria-label={`Open ${name}`} className={base}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Open ${name}`}
      onClick={() => onOpenFile(entry)}
      className={base}
    >
      {children}
    </button>
  );
}

function SelectMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/50 text-transparent",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

function SongChips({ entry }: { entry: FileEntry }) {
  const links = entry.songLinks;
  if (links.length === 0) return null;
  const shown = links.slice(0, 2);
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {shown.map((l) => (
        <Badge
          key={l.songId}
          variant="secondary"
          data-testid="file-song-chip"
          className="max-w-40 min-w-0"
        >
          <span className="truncate">{l.title}</span>
        </Badge>
      ))}
      {links.length > shown.length ? (
        <Badge variant="outline">+{links.length - shown.length}</Badge>
      ) : null}
    </span>
  );
}

function NameBlock({
  entry,
  subtitle,
}: {
  entry: FileEntry;
  subtitle: string;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2">
        <span className="max-w-full truncate text-sm font-medium">
          {displayName(entry)}
        </span>
        {entry.isGigsRoot ? (
          <Badge variant="secondary" data-testid="gigs-root-badge">
            Gig folders
          </Badge>
        ) : null}
      </span>
      {subtitle ? (
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </span>
  );
}

/** Drive-style table row on desktop, compact two-line row on mobile. */
export function FileRow(props: EntryProps) {
  const { bandId, entry, selecting, selected } = props;
  const size = formatSize(entry.sizeBytes);
  const modified = formatModified(entry.modifiedTime);
  const gigDate = entry.gig ? formatGigDate(entry.gig.date) : "";
  const mobileMeta = entry.gig
    ? ""
    : [modified, size].filter(Boolean).join(" · ");
  return (
    <li
      data-testid="file-row"
      data-name={displayName(entry)}
      data-kind={entry.kind}
      data-selected={selected}
      onContextMenu={(e) => {
        if (selecting) return;
        e.preventDefault();
        props.onMenuOpenChange(true);
      }}
      className={cn(
        "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b px-2 py-1 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_8rem_5rem_2.75rem] md:px-3",
        selected && "bg-primary/10",
      )}
    >
      <Activator
        {...props}
        className="col-start-1 row-start-1 flex min-h-11 items-center gap-3 rounded-lg"
      >
        {selecting ? <SelectMark selected={selected} /> : null}
        <span className="flex size-9 shrink-0 items-center justify-center">
          <EntryVisual bandId={bandId} entry={entry} size="row" />
        </span>
        <NameBlock
          entry={entry}
          subtitle={entry.gig ? `Gig · ${gigDate}` : ""}
        />
      </Activator>
      <span className="col-span-2 col-start-1 row-start-2 min-w-0 pb-1 pl-12 empty:hidden md:col-span-1 md:col-start-2 md:row-start-1 md:pb-0 md:pl-0">
        {mobileMeta ? (
          <span className="block text-xs text-muted-foreground md:hidden">
            {mobileMeta}
          </span>
        ) : null}
        <SongChips entry={entry} />
      </span>
      <span className="hidden text-sm text-muted-foreground md:col-start-3 md:row-start-1 md:block">
        {modified}
      </span>
      <span className="hidden text-sm text-muted-foreground md:col-start-4 md:row-start-1 md:block">
        {size}
      </span>
      <span className="col-start-2 row-start-1 md:col-start-5">
        <ItemMenu
          entry={entry}
          open={props.menuOpen}
          onOpenChange={props.onMenuOpenChange}
          actions={props.actions}
        />
      </span>
    </li>
  );
}

/** Grid tile: large preview or folder, name row with the kebab beneath. */
export function FileTile(props: EntryProps) {
  const { bandId, entry, selecting, selected } = props;
  const gigDate = entry.gig ? formatGigDate(entry.gig.date) : "";
  return (
    <li
      data-testid="file-tile"
      data-name={displayName(entry)}
      data-kind={entry.kind}
      data-selected={selected}
      onContextMenu={(e) => {
        if (selecting) return;
        e.preventDefault();
        props.onMenuOpenChange(true);
      }}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card",
        selected && "border-primary ring-2 ring-primary",
      )}
    >
      <Activator
        {...props}
        className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted/40"
      >
        <EntryVisual bandId={bandId} entry={entry} size="tile" />
        {selecting ? (
          <span className="absolute top-2 left-2">
            <SelectMark selected={selected} />
          </span>
        ) : null}
      </Activator>
      <div className="flex items-center gap-1 pl-3">
        <div className="min-w-0 flex-1 py-1">
          <NameBlock
            entry={entry}
            subtitle={gigDate ? `Gig · ${gigDate}` : ""}
          />
          <SongChips entry={entry} />
        </div>
        <ItemMenu
          entry={entry}
          open={props.menuOpen}
          onOpenChange={props.onMenuOpenChange}
          actions={props.actions}
        />
      </div>
    </li>
  );
}
