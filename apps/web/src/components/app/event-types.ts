import { CalendarDays, Mic2, type LucideIcon } from "lucide-react";

export type EventType = "gig" | "practice";

interface EventTypeStyle {
  label: string;
  icon: LucideIcon;
  /** Solid fill, for dots and bars. */
  solid: string;
  /** Soft tinted surface with readable text. */
  soft: string;
  /** Text colour only. */
  text: string;
  /** Left accent border colour. */
  border: string;
}

/** Class strings are literals so Tailwind can see them. */
export const EVENT_TYPES: Record<EventType, EventTypeStyle> = {
  gig: {
    label: "Gig",
    icon: Mic2,
    solid: "bg-gig",
    soft: "bg-gig-soft text-gig-soft-foreground",
    text: "text-gig",
    border: "border-gig",
  },
  practice: {
    label: "Practice",
    icon: CalendarDays,
    solid: "bg-practice",
    soft: "bg-practice-soft text-practice-soft-foreground",
    text: "text-practice",
    border: "border-practice",
  },
};

/** Where fixed overlays sit: the viewport, or the nearest positioned parent. */
export type Placement = "fixed" | "contained";

/** Which navigation layout a shell part shows. */
export type ShellLayout = "responsive" | "mobile" | "desktop";

const PALETTE = [
  "bg-gig-soft text-gig-soft-foreground",
  "bg-practice-soft text-practice-soft-foreground",
  "bg-maybe/20 text-foreground",
  "bg-today/15 text-foreground",
];

/** Stable soft tint for avatars and placeholder art, derived from a string. */
export function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
