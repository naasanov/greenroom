"use client";

import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INSTRUMENTS,
  InstrumentIcon,
  findInstrument,
} from "@/components/app/instruments";
import { cn } from "@/lib/utils";

/**
 * Multi-select grid of preset instruments plus custom entries.
 * `value` holds preset keys and custom names as typed.
 */
export function InstrumentPicker({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const custom = value.filter((v) => !findInstrument(v));

  function toggle(key: string) {
    onChange(
      value.includes(key) ? value.filter((v) => v !== key) : [...value, key],
    );
  }

  function addCustom() {
    const name = draft.trim();
    if (!name) return;
    const preset = INSTRUMENTS.find(
      (i) => i.label.toLowerCase() === name.toLowerCase(),
    );
    const key = preset?.key ?? name;
    const exists = value.some((v) => v.toLowerCase() === key.toLowerCase());
    if (!exists) onChange([...value, key]);
    setDraft("");
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        role="group"
        aria-label="Instruments"
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-5"
      >
        {INSTRUMENTS.map((inst) => {
          const selected = value.includes(inst.key);
          return (
            <button
              key={inst.key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(inst.key)}
              className={cn(
                "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-2 py-3 text-center text-sm font-medium shadow-soft transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                selected
                  ? "border-primary bg-gig-soft text-gig-soft-foreground"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <inst.icon className="size-7" />
              <span className="leading-tight">{inst.label}</span>
              {selected ? (
                <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Something else? e.g. Oud"
          aria-label="Custom instrument"
          maxLength={40}
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </form>

      {custom.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Custom instruments">
          {custom.map((name) => (
            <li
              key={name}
              className="flex h-10 items-center gap-1.5 rounded-full bg-gig-soft pr-1 pl-3 text-sm font-medium text-gig-soft-foreground"
            >
              <InstrumentIcon instrument={name} className="size-4" />
              <span className="max-w-40 truncate">{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => toggle(name)}
                className="flex size-8 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
