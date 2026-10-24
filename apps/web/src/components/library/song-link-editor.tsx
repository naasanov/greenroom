"use client";

import { Plus, Trash2 } from "lucide-react";
import type { LinkRow } from "@/components/app/link-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
          <div className="flex items-center gap-2">
            <Input
              value={row.label}
              onChange={(e) => update(row.id, { label: e.target.value })}
              placeholder="Label"
              aria-label="Reference label"
              className="min-w-0 flex-1"
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
