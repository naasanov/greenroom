"use client";

import { ChevronDown, Guitar, Plus } from "lucide-react";
import { isUltimateGuitarUrl } from "@greenroom/shared";
import { Favicon } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChordsIndex, useChordsSuggestion } from "@/lib/queries/chords";
import { useReferenceTags, useSuggestedReferences } from "@/lib/queries/songs";
import { rankSuggestions } from "./song-utils";
import { useDebounced } from "./use-debounced";

/**
 * One chip per suggested reference, rendered beside the "Add row" button.
 * Tapping a chip hands its label and link to `onAdd`; nothing is added automatically.
 */
export function SuggestedReferenceChips({
  bandId,
  sourceUrl,
  title,
  artist,
  rows,
  onAdd,
}: {
  bandId: string;
  sourceUrl: string | null;
  /** The song's title and artist, for the Ultimate Guitar chords suggestion. */
  title?: string;
  artist?: string | null;
  rows: { label: string; value: string }[];
  onAdd: (label: string, value: string) => void;
}) {
  const found = useSuggestedReferences(bandId, sourceUrl);
  const tags = useReferenceTags(bandId);
  // Wait for the band's tags so the order settles once and stays put.
  const chordsChip = (
    <ChordsChip
      bandId={bandId}
      title={title ?? ""}
      artist={artist}
      rows={rows}
      onAdd={onAdd}
    />
  );
  if (!found.data || tags.isPending) return chordsChip;
  const chips = rankSuggestions(
    found.data,
    rows,
    (tags.data ?? []).map((t) => t.label),
  );
  if (chips.length === 0) return chordsChip;

  return (
    <>
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          variant="outline"
          data-testid="suggestion-chip"
          data-key={chip.key}
          onClick={() => onAdd(chip.label, chip.value)}
          className="border-dashed"
        >
          <Plus />
          <Favicon host={hostOf(chip.value)} compact />
          {chip.label}
        </Button>
      ))}
      {chordsChip}
    </>
  );
}

const versionText = (v: { rating: number; votes: number }) =>
  `${v.rating.toFixed(1)}, ${v.votes} ratings`;

/** "Chords" chip for the best Ultimate Guitar match, plus a menu of other versions. */
function ChordsChip({
  bandId,
  title,
  artist,
  rows,
  onAdd,
}: {
  bandId: string;
  title: string;
  artist?: string | null;
  rows: { label: string; value: string }[];
  onAdd: (label: string, value: string) => void;
}) {
  const index = useChordsIndex(bandId);
  const hasUg = rows.some((r) => isUltimateGuitarUrl(r.value));
  // Lookups wait for a settled title of 3+ characters so partial typing stays quiet.
  const settledTitle = useDebounced(title.trim(), 800);
  const settledArtist = useDebounced(artist ?? null, 800);
  const lookup = useChordsSuggestion(
    bandId,
    settledTitle,
    settledArtist,
    index.data?.enabled === true && !hasUg && settledTitle.length >= 3,
  );
  const match = lookup.data?.match;
  if (index.data?.enabled !== true || hasUg || !match) return null;
  const others = lookup.data?.versions ?? [];
  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="reference-chip-chords"
        onClick={() => onAdd("Chords", match.url)}
        className="border-dashed"
      >
        <Plus />
        <Guitar />
        Chords
      </Button>
      {others.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              data-testid="reference-chip-chords-others"
            >
              Other versions <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {others.map((v) => (
              <DropdownMenuItem
                key={v.url}
                data-testid="reference-chip-chords-version"
                onSelect={() => onAdd("Chords", v.url)}
              >
                {versionText(v)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
