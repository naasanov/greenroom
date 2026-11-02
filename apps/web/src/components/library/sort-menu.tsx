"use client";

import { ArrowUpDown } from "lucide-react";
import type { SongSort } from "@greenroom/shared";
import { SONG_SORTS } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SORT_LABELS, saveSort } from "./song-utils";

/**
 * The "Sort songs" dropdown shared by the library and the setlist picker.
 * Choosing an option persists it; `iconOnly` drops the label for tight rows.
 */
export function SortMenu({
  sort,
  onChange,
  iconOnly = false,
  className,
}: {
  sort: SongSort;
  onChange: (sort: SongSort) => void;
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={iconOnly ? "icon" : undefined}
          aria-label="Sort songs"
          title={iconOnly ? `Sort: ${SORT_LABELS[sort]}` : undefined}
          className={className}
        >
          <ArrowUpDown />
          {iconOnly ? null : <span>Sort: {SORT_LABELS[sort]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(v) => {
            const next = v as SongSort;
            onChange(next);
            saveSort(next);
          }}
        >
          {SONG_SORTS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {SORT_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
