"use client";

import { Plus } from "lucide-react";
import { Favicon } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import { useReferenceTags, useSuggestedReferences } from "@/lib/queries/songs";
import { rankSuggestions } from "./song-utils";

/**
 * One chip per suggested reference, rendered beside the "Add row" button.
 * Tapping a chip hands its label and link to `onAdd`; nothing is added automatically.
 */
export function SuggestedReferenceChips({
  bandId,
  sourceUrl,
  rows,
  onAdd,
}: {
  bandId: string;
  sourceUrl: string | null;
  rows: { label: string; value: string }[];
  onAdd: (label: string, value: string) => void;
}) {
  const found = useSuggestedReferences(bandId, sourceUrl);
  const tags = useReferenceTags(bandId);
  // Wait for the band's tags so the order settles once and stays put.
  if (!found.data || tags.isPending) return null;
  const chips = rankSuggestions(
    found.data,
    rows,
    (tags.data ?? []).map((t) => t.label),
  );
  if (chips.length === 0) return null;

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
