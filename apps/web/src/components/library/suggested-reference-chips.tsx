"use client";

import { Guitar, Link2, Plus } from "lucide-react";
import type { SVGProps } from "react";
import type { SuggestibleKey } from "@greenroom/shared";
import { useReferenceTags, useSuggestedReferences } from "@/lib/queries/songs";
import { useDebounced } from "./use-debounced";
import { rankSuggestions } from "./song-utils";

type IconProps = SVGProps<SVGSVGElement>;

const svg = (children: React.ReactNode) =>
  function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  };

const SpotifyIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.5c2.5-.7 5-.5 7.5.8M8.5 15.3c2-.5 4-.3 6 .7" />
  </>,
);
const YouTubeIcon = svg(
  <>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
  </>,
);
const YouTubeMusicIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m10.5 9 4 3-4 3z" />
  </>,
);
const AppleMusicIcon = svg(
  <>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </>,
);
// Songsterr tabs use a guitar glyph; the service name is never rendered.
const SongsterrIcon = (props: IconProps) => (
  <Guitar data-icon="songsterr" aria-hidden="true" {...props} />
);

// Providers without an entry here fall back to a generic link glyph.
const ICONS: Partial<
  Record<SuggestibleKey, (p: IconProps) => React.JSX.Element>
> = {
  spotify: SpotifyIcon,
  youtubeMusic: YouTubeMusicIcon,
  youtube: YouTubeIcon,
  appleMusic: AppleMusicIcon,
  bassTabs: SongsterrIcon,
  guitarTabs: SongsterrIcon,
};

/**
 * One thin chip per suggested reference, below the link rows. Tapping a
 * chip hands its label and link to `onAdd`; nothing is added automatically.
 */
export function SuggestedReferenceChips({
  bandId,
  title,
  artist,
  sourceUrl,
  rows,
  onAdd,
}: {
  bandId: string;
  title: string;
  artist: string;
  sourceUrl: string | null;
  rows: { label: string; value: string }[];
  onAdd: (label: string, value: string) => void;
}) {
  const debouncedTitle = useDebounced(title.trim(), 500);
  const debouncedArtist = useDebounced(artist.trim(), 500);
  const found = useSuggestedReferences(
    bandId,
    debouncedTitle,
    debouncedArtist,
    sourceUrl,
  );
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
    <div
      data-testid="suggestion-chips"
      className="flex flex-nowrap gap-1.5 overflow-hidden"
    >
      {chips.map((chip) => {
        const Icon = ICONS[chip.key] ?? Link2;
        return (
          <button
            key={chip.key}
            type="button"
            data-testid="suggestion-chip"
            data-key={chip.key}
            onClick={() => onAdd(chip.label, chip.value)}
            className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3 opacity-60" aria-hidden="true" />
            <Icon className="size-3.5" />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
