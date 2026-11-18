"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  SUGGESTIBLE_REFERENCES,
  findMagicReference,
  type ReferenceTag,
} from "@greenroom/shared";
import { Favicon, type LinkRow } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentBand } from "@/lib/current-band";
import { useReferenceTags } from "@/lib/queries/songs";
import { cn } from "@/lib/utils";
import { invalidMagicKey } from "./song-utils";

const MAX_SUGGESTIONS = 6;

/**
 * Band tags first, then magic keys the band has not used (matched
 * case-insensitively). Prefix matches rank before contains matches, the tag
 * typed in full is dropped, and magic keys show their canonical label.
 */
export function matchTags(tags: ReferenceTag[], query: string): ReferenceTag[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const starts: ReferenceTag[] = [];
  const contains: ReferenceTag[] = [];
  const candidates = [
    ...tags.map((t) => ({
      ...t,
      label: findMagicReference(t.label)?.label ?? t.label,
    })),
    ...SUGGESTIBLE_REFERENCES.map((r) => ({ label: r.label, count: 0 })),
  ];
  for (const t of candidates) {
    const l = t.label.toLowerCase();
    if (seen.has(l)) continue;
    seen.add(l);
    if (l === q) continue;
    if (l.startsWith(q)) starts.push(t);
    else if (l.includes(q)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

/** Label input with a combobox listbox of the band's tags and the magic keys. */
function TagInput({
  value,
  tags,
  onChange,
}: {
  value: string;
  tags: ReferenceTag[];
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const options = focused ? matchTags(tags, value) : [];
  const open = options.length > 0;
  const activeIndex = active < options.length ? active : -1;

  const magic = findMagicReference(value);
  const pick = (label: string) => {
    onChange(findMagicReference(label)?.label ?? label);
    setActive(-1);
  };

  return (
    <div className="relative min-w-0 flex-1">
      {magic ? (
        <span
          data-testid="label-favicon"
          data-key={magic.key}
          className="pointer-events-none absolute top-[22px] left-3 -translate-y-1/2"
        >
          <Favicon host={magic.hosts[0]} compact />
        </span>
      ) : null}
      <Input
        className={magic ? "pl-9" : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((activeIndex + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((activeIndex - 1 + options.length) % options.length);
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pick(options[activeIndex]!.label);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setFocused(false);
          }
        }}
        placeholder="Label"
        aria-label="Reference label"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested tags"
          className="mt-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-soft"
        >
          {options.map((t, i) => (
            <li
              key={t.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t.label);
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                i === activeIndex ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <span className="truncate">{t.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Editable reference rows. Each row stacks a full-width label over a
 * full-width link, with the remove button beside the label.
 */
export function SongLinkEditor({
  rows,
  onChange,
  extra,
}: {
  rows: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  /** Rendered after the "Add row" button, wrapping with it. */
  extra?: React.ReactNode;
}) {
  const { currentBand } = useCurrentBand();
  const tags = useReferenceTags(currentBand?.id).data ?? [];
  const update = (id: string, patch: Partial<LinkRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const invalid = invalidMagicKey(row);
        return (
          <div
            key={row.id}
            data-testid="link-row"
            className="flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-soft"
          >
            <div className="flex items-start gap-2">
              <TagInput
                value={row.label}
                tags={tags}
                onChange={(label) => update(row.id, { label })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove row"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                <Trash2 />
              </Button>
            </div>
            <Input
              value={row.value}
              onChange={(e) => update(row.id, { value: e.target.value })}
              placeholder="Link or text"
              aria-label="Reference value"
              inputMode="url"
              autoCapitalize="none"
              aria-invalid={invalid ? true : undefined}
            />
            {invalid ? (
              <p role="alert" className="px-1 text-sm text-destructive">
                {invalid.label} needs an https link on{" "}
                {invalid.hosts.join(" or ")}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-dashed"
          onClick={() =>
            onChange([
              ...rows,
              { id: `row-${crypto.randomUUID()}`, label: "", value: "" },
            ])
          }
        >
          <Plus /> Add row
        </Button>
        {extra}
      </div>
    </div>
  );
}
