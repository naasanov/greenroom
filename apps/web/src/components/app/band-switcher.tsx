"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toneFor } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

export interface BandSummary {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** Skips leading articles; two words give their first letters, one word its first two. */
export function bandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const rest =
    words.length > 1 && /^(the|a|an)$/i.test(words[0]!)
      ? words.slice(1)
      : words;
  const letters =
    rest.length > 1
      ? `${rest[0]![0]}${rest[1]![0]}`
      : (rest[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

export function BandAvatar({
  band,
  className,
}: {
  band: BandSummary;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 rounded-xl after:rounded-xl", className)}>
      {band.imageUrl ? (
        <AvatarImage src={band.imageUrl} alt="" className="rounded-xl" />
      ) : null}
      <AvatarFallback
        className={cn("rounded-xl text-sm font-semibold", toneFor(band.id))}
      >
        {bandInitials(band.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Band photo + name; a dropdown lists the user's bands. */
export function BandSwitcher({
  bands,
  activeId,
  onSelect,
  onCreate,
  className,
}: {
  bands: BandSummary[];
  activeId: string;
  onSelect?: (id: string) => void;
  onCreate?: () => void;
  className?: string;
}) {
  const active = bands.find((b) => b.id === activeId) ?? bands[0];
  if (!active) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch band, current: ${active.name}`}
          className={cn(
            "flex h-11 min-w-0 items-center gap-2.5 rounded-2xl py-1 pr-2 pl-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
            className,
          )}
        >
          <BandAvatar band={active} />
          <span className="min-w-0 truncate text-[0.95rem] font-semibold">
            {active.name}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 max-w-[calc(100vw-1.5rem)]"
      >
        <DropdownMenuLabel>Your bands</DropdownMenuLabel>
        {bands.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={() => onSelect?.(b.id)}
            className="gap-3"
          >
            <BandAvatar band={b} className="size-8" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {b.name}
            </span>
            {b.id === active.id ? (
              <Check className="size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {onCreate ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate} className="gap-3">
              <span className="flex size-8 items-center justify-center rounded-xl border border-dashed">
                <Plus className="size-4" />
              </span>
              Create another band
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
