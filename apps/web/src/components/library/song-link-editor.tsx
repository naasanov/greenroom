"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { ReferenceTag } from "@greenroom/shared";
import type { LinkRow } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentBand } from "@/lib/current-band";
import { useReferenceTags } from "@/lib/queries/songs";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 6;

/** Prefix matches first, then contains matches; the tag typed in full is dropped. */
export function matchTags(tags: ReferenceTag[], query: string): ReferenceTag[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: ReferenceTag[] = [];
  const contains: ReferenceTag[] = [];
  for (const t of tags) {
    const l = t.label.toLowerCase();
    if (l === q) continue;
    if (l.startsWith(q)) starts.push(t);
    else if (l.includes(q)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

/** Label input with a combobox listbox of the band's previously used tags. */
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

  const pick = (label: string) => {
    onChange(label);
    setActive(-1);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Input
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
              <span className="text-xs text-muted-foreground">
                {t.count} {t.count === 1 ? "song" : "songs"}
              </span>
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
}: {
  rows: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
}) {
  const { currentBand } = useCurrentBand();
  const tags = useReferenceTags(currentBand?.id).data ?? [];
  const update = (id: string, patch: Partial<LinkRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
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
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start border-dashed"
        onClick={() =>
          onChange([
            ...rows,
            { id: `row-${crypto.randomUUID()}`, label: "", value: "" },
          ])
        }
      >
        <Plus /> Add row
      </Button>
    </div>
  );
}
