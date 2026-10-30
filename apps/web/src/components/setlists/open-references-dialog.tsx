"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { parseLink } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import { useSongReferences } from "@/lib/queries/songs";
import { cn } from "@/lib/utils";

export interface OpenReferencesSong {
  id: string;
  title: string;
  /** Skips the detail fetch when the caller already has the links. */
  references?: { label: string; value: string }[];
}

interface Tag {
  key: string;
  label: string;
  songCount: number;
}

interface Row {
  songId: string;
  title: string;
  urls: string[];
}

const storageKey = (bandId: string) =>
  `greenroom:open-references-tag:${bandId}`;

function readSaved(bandId: string): string | null {
  try {
    return localStorage.getItem(storageKey(bandId));
  } catch {
    return null;
  }
}

function writeSaved(bandId: string, key: string) {
  try {
    localStorage.setItem(storageKey(bandId), key);
  } catch {
    // Storage can be unavailable; the choice just is not remembered.
  }
}

/** Opens one link in a new tab. Null means the browser blocked it. */
function openTab(url: string): boolean {
  const w = window.open(url, "_blank");
  if (!w) return false;
  // "noopener" in the features string always returns null, so the opener is cut here.
  w.opener = null;
  return true;
}

/**
 * Lets the user pick a reference tag (e.g. "Bass tab") and open that tag's
 * link for every song in the setlist, in setlist order.
 */
export function OpenReferencesDialog({
  bandId,
  songs,
  open,
  onOpenChange,
}: {
  bandId: string;
  songs: OpenReferencesSong[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const needFetch = songs.filter((s) => !s.references).map((s) => s.id);
  const fetched = useSongReferences(bandId, open ? needFetch : []);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<{
    opened: number;
    blocked: number;
  } | null>(null);

  const { tags, rowsByTag } = useMemo(() => {
    const tagMap = new Map<string, Tag>();
    for (const song of songs) {
      const seen = new Set<string>();
      for (const ref of song.references ?? fetched.byId.get(song.id) ?? []) {
        const key = ref.label.trim().toLowerCase();
        if (!key || !parseLink(ref.value)) continue;
        const tag = tagMap.get(key) ?? {
          key,
          label: ref.label.trim(),
          songCount: 0,
        };
        if (!seen.has(key)) tag.songCount += 1;
        seen.add(key);
        tagMap.set(key, tag);
      }
    }
    const rowsByKey = new Map<string, Row[]>();
    for (const key of tagMap.keys()) {
      rowsByKey.set(
        key,
        songs.map((song) => {
          const refs = song.references ?? fetched.byId.get(song.id) ?? [];
          const urls = refs
            .filter((r) => r.label.trim().toLowerCase() === key)
            .map((r) => parseLink(r.value)?.href)
            .filter((u): u is string => !!u);
          return { songId: song.id, title: song.title, urls };
        }),
      );
    }
    const sorted = [...tagMap.values()].sort(
      (a, b) => b.songCount - a.songCount || a.label.localeCompare(b.label),
    );
    return { tags: sorted, rowsByTag: rowsByKey };
  }, [songs, fetched.byId]);

  const saved = readSaved(bandId);
  const selectedKey =
    picked && rowsByTag.has(picked)
      ? picked
      : saved && rowsByTag.has(saved)
        ? saved
        : null;
  const rows = selectedKey ? (rowsByTag.get(selectedKey) ?? []) : [];
  const withLinks = rows.filter((r) => r.urls.length > 0);
  const total = songs.length;

  const choose = (key: string) => {
    setPicked(key);
    setResult(null);
    writeSaved(bandId, key);
  };

  const openAll = () => {
    let opened = 0;
    let blocked = 0;
    for (const row of withLinks) {
      for (const url of row.urls) {
        if (openTab(url)) opened += 1;
        else blocked += 1;
      }
    }
    setResult({ opened, blocked });
  };

  const empty = !fetched.loading && tags.length === 0;

  return (
    <BottomDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPicked(null);
          setResult(null);
        }
        onOpenChange(next);
      }}
      title="Open references"
      description="Open one kind of reference for every song in this setlist."
      footer={
        <Button
          type="button"
          disabled={withLinks.length === 0}
          onClick={openAll}
        >
          <ExternalLink /> Open all
        </Button>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        {fetched.loading && tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading references...</p>
        ) : null}
        {empty ? (
          <p className="text-sm text-muted-foreground">
            None of these songs have reference links yet.
          </p>
        ) : null}
        {tags.length > 0 ? (
          <div
            role="radiogroup"
            aria-label="Reference tag"
            className="flex flex-wrap gap-2"
          >
            {tags.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={t.key === selectedKey}
                onClick={() => choose(t.key)}
                className={cn(
                  "min-h-9 rounded-full border px-3 py-1 text-sm transition-colors",
                  t.key === selectedKey
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted",
                )}
              >
                {t.label} ({t.songCount} of {total} songs)
              </button>
            ))}
          </div>
        ) : null}
        {result ? (
          <p role="status" className="text-sm" data-testid="open-result">
            {result.blocked === 0
              ? `${result.opened} opened.`
              : `${result.opened} opened, ${result.blocked} blocked. Allow pop-ups for this site, or tap each link below.`}
          </p>
        ) : null}
        {selectedKey ? (
          <ol className="flex flex-col gap-2" data-testid="reference-preview">
            {rows.map((row, i) => (
              <li
                key={row.songId + i}
                className="flex min-h-12 items-center gap-3 rounded-2xl border bg-card px-3 py-2"
              >
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.title}
                </span>
                {row.urls.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No link</span>
                ) : (
                  <span className="flex shrink-0 gap-1">
                    {row.urls.map((url, n) => (
                      <Button
                        key={url + n}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Open ${row.title}${row.urls.length > 1 ? ` link ${n + 1}` : ""}`}
                        onClick={() => {
                          setResult(null);
                          openTab(url);
                        }}
                      >
                        <ExternalLink /> Open
                      </Button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </BottomDrawer>
  );
}
