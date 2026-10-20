"use client";

import { ExternalLink, Globe, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LinkRow {
  id: string;
  label: string;
  value: string;
}

/** Returns a URL when the text looks like a link or bare domain. */
export function parseLink(value: string): URL | null {
  const text = value.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

function Favicon({ host }: { host: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!host || failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Globe className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
        alt=""
        width={20}
        height={20}
        className="size-5 rounded-sm"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/**
 * Label | value rows. Read mode renders links with the site favicon;
 * edit mode renders inputs with a remove button and an add-row button.
 */
export function LinkList({
  rows,
  onChange,
  editing = false,
  className,
}: {
  rows: LinkRow[];
  onChange?: (rows: LinkRow[]) => void;
  editing?: boolean;
  className?: string;
}) {
  function update(id: string, patch: Partial<LinkRow>) {
    onChange?.(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {rows.length === 0 && !editing ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : null}
      {rows.map((row) => {
        const url = parseLink(row.value);
        if (!editing) {
          const content = (
            <>
              <Favicon host={url?.hostname ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.label || url?.hostname || "Link"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.value}
                </span>
              </span>
              {url ? (
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
              ) : null}
            </>
          );
          const base =
            "flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 py-2 shadow-soft";
          return url ? (
            <a
              key={row.id}
              href={url.href}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(base, "transition-colors hover:bg-muted")}
            >
              {content}
            </a>
          ) : (
            <div key={row.id} className={base}>
              {content}
            </div>
          );
        }
        return (
          <div
            key={row.id}
            data-testid="link-row"
            className="flex items-start gap-2 rounded-2xl border bg-card p-2 shadow-soft"
          >
            <div className="mt-1.5 hidden sm:block">
              <Favicon host={url?.hostname ?? null} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <Input
                value={row.label}
                onChange={(e) => update(row.id, { label: e.target.value })}
                placeholder="Label"
                aria-label="Link label"
                className="sm:w-2/5"
              />
              <Input
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
                placeholder="Link or text"
                aria-label="Link value"
                inputMode="url"
                autoCapitalize="none"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove row"
              onClick={() => onChange?.(rows.filter((r) => r.id !== row.id))}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      {editing ? (
        <Button
          type="button"
          variant="outline"
          className="self-start border-dashed"
          onClick={() =>
            onChange?.([
              ...rows,
              { id: `row-${crypto.randomUUID()}`, label: "", value: "" },
            ])
          }
        >
          <Plus /> Add link
        </Button>
      ) : null}
    </div>
  );
}
