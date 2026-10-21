"use client";

import { Loader2, MapPin, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchPlace,
  usePlaceSuggestions,
  type PlaceDetails,
} from "@/lib/queries/events";
import { cn } from "@/lib/utils";

export interface PlaceValue {
  venueName: string;
  address: string;
  googlePlaceId: string;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_PLACE: PlaceValue = {
  venueName: "",
  address: "",
  googlePlaceId: "",
  lat: null,
  lng: null,
};

const DEBOUNCE_MS = 250;

/**
 * Venue field with Places type-ahead. Typing sets a free-text venue name; picking
 * a suggestion fills the name, address, place id and coordinates.
 */
export function PlacePicker({
  bandId,
  value,
  onChange,
  id,
}: {
  bandId: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  id: string;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const suggestions = usePlaceSuggestions(bandId, query);
  const options =
    focused && !value.googlePlaceId && query.trim().length >= 2
      ? (suggestions.data ?? [])
      : [];
  const open = options.length > 0;

  function type(text: string) {
    onChange({ ...EMPTY_PLACE, venueName: text });
    setActive(-1);
    setFailed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(text), DEBOUNCE_MS);
  }

  async function pick(placeId: string) {
    setResolving(true);
    setFailed(false);
    try {
      const place: PlaceDetails = await fetchPlace(bandId, placeId);
      onChange({
        venueName: place.name,
        address: place.address,
        googlePlaceId: place.placeId,
        lat: place.lat,
        lng: place.lng,
      });
      setQuery("");
      setActive(-1);
    } catch {
      setFailed(true);
    } finally {
      setResolving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void pick(options[active].placeId);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setFocused(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          placeholder="Search for a venue"
          value={value.venueName}
          onChange={(e) => type(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={cn(value.venueName && "pr-11")}
        />
        {resolving ? (
          <Loader2 className="absolute top-3.5 right-3.5 size-4 animate-spin text-muted-foreground" />
        ) : value.venueName ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear venue"
            className="absolute top-1 right-1 text-muted-foreground"
            onClick={() => {
              onChange(EMPTY_PLACE);
              setQuery("");
            }}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Venue suggestions"
          className="overflow-hidden rounded-xl border bg-popover shadow-soft"
        >
          {options.map((o, i) => (
            <li
              key={o.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown keeps focus in the input so blur does not close the list first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(o.placeId)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                i === active ? "bg-accent" : "hover:bg-muted",
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{o.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {value.address ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          {value.address}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load that place. Try another.
        </p>
      ) : null}
    </div>
  );
}
