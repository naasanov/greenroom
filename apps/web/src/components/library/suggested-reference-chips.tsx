"use client";

import { ChevronDown, Plus } from "lucide-react";
import { UG_HOST_LIST, isUltimateGuitarUrl } from "@greenroom/shared";
import { cn } from "cn";
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
import {
  CHIP_FADE_IN,
  SuggestionChipRow,
  type SuggestionChipItem,
} from "./suggestion-chip-row";
import { useDebounced } from "./use-debounced";

/**
 * One chip per suggested reference, capped at two rows behind a dots chip.
 * Tapping a chip hands its label and link to `onAdd`; `disabled` greys every chip out.
 */
export function SuggestedReferenceChips({
  bandId,
  sourceUrl,
  title,
  artist,
  rows,
  onAdd,
  disabled = false,
}: {
  bandId: string;
  sourceUrl: string | null;
  /** The song's title and artist, for the Ultimate Guitar chords suggestion. */
  title?: string;
  artist?: string | null;
  rows: { label: string; value: string }[];
  onAdd: (label: string, value: string) => void;
  disabled?: boolean;
}) {
  const found = useSuggestedReferences(bandId, sourceUrl);
  const tags = useReferenceTags(bandId);
  const chords = useChordsOffer(bandId, title ?? "", artist, rows);
  // Wait for the band's tags so the order settles once and stays put.
  const loading = !!sourceUrl && (found.isPending || tags.isPending);
  const ranked =
    found.data && !tags.isPending
      ? rankSuggestions(
          found.data,
          rows,
          (tags.data ?? []).map((t) => t.label),
        )
      : [];
  const items: SuggestionChipItem[] = ranked.map((chip) => ({
    key: chip.key,
    node: (
      <Button
        type="button"
        variant="outline"
        data-testid="suggestion-chip"
        data-key={chip.key}
        disabled={disabled}
        onClick={() => onAdd(chip.label, chip.value)}
        className={cn("border-dashed", CHIP_FADE_IN)}
      >
        <Plus />
        <Favicon host={hostOf(chip.value)} compact />
        {chip.label}
      </Button>
    ),
  }));
  if (chords) {
    items.push({
      key: "ultimate-guitar",
      node: <ChordsChip offer={chords} onAdd={onAdd} disabled={disabled} />,
    });
  }
  return <SuggestionChipRow items={items} loading={loading} />;
}

const versionText = (v: { rating: number; votes: number }) =>
  `${v.rating.toFixed(1)}, ${v.votes} ratings`;

interface ChordsOffer {
  match: { url: string };
  others: { url: string; rating: number; votes: number }[];
}

/** The best Ultimate Guitar match for the song, or null when none should be offered. */
function useChordsOffer(
  bandId: string,
  title: string,
  artist: string | null | undefined,
  rows: { label: string; value: string }[],
): ChordsOffer | null {
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
  return { match, others: lookup.data?.versions ?? [] };
}

/** "Ultimate Guitar" chip, plus a menu of other versions, as one row item. */
function ChordsChip({
  offer,
  onAdd,
  disabled,
}: {
  offer: ChordsOffer;
  onAdd: (label: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={cn("flex gap-2", CHIP_FADE_IN)}>
      <Button
        type="button"
        variant="outline"
        data-testid="reference-chip-ultimate-guitar"
        disabled={disabled}
        onClick={() => onAdd("Ultimate Guitar", offer.match.url)}
        className="border-dashed"
      >
        <Plus />
        <Favicon host={UG_HOST_LIST[0]} compact />
        Ultimate Guitar
      </Button>
      {offer.others.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              data-testid="reference-chip-ultimate-guitar-others"
              disabled={disabled}
            >
              Other versions <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {offer.others.map((v) => (
              <DropdownMenuItem
                key={v.url}
                data-testid="reference-chip-ultimate-guitar-version"
                disabled={disabled}
                onSelect={() => onAdd("Ultimate Guitar", v.url)}
              >
                {versionText(v)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
