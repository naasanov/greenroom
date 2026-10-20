import {
  Check,
  CircleDashed,
  Hand,
  LoaderCircle,
  OctagonX,
  type LucideIcon,
} from "lucide-react";
import type { StatusKind } from "@/lib/plan";

export const STATUS_META: Record<
  StatusKind,
  {
    label: string;
    icon: LucideIcon;
    /** Solid node fill and icon color. */
    node: string;
    /** Soft badge colors. */
    badge: string;
    /** Card border accent. */
    border: string;
    /** Bar and legend dot. */
    dot: string;
  }
> = {
  done: {
    label: "Done",
    icon: Check,
    node: "bg-going text-background border-going",
    badge: "bg-going/15 text-going",
    border: "border-border",
    dot: "bg-going",
  },
  "in-progress": {
    label: "In progress",
    icon: LoaderCircle,
    node: "bg-practice text-background border-practice",
    badge: "bg-practice-soft text-practice-soft-foreground",
    border: "border-practice/40",
    dot: "bg-practice",
  },
  review: {
    label: "Needs your review",
    icon: Hand,
    node: "bg-today text-background border-today",
    badge: "bg-today text-background",
    border: "border-today",
    dot: "bg-today",
  },
  blocked: {
    label: "Blocked",
    icon: OctagonX,
    node: "bg-destructive text-background border-destructive",
    badge: "bg-destructive/15 text-destructive",
    border: "border-destructive/50",
    dot: "bg-destructive",
  },
  "not-started": {
    label: "Not started",
    icon: CircleDashed,
    node: "bg-background text-muted-foreground border-border",
    badge: "bg-muted text-muted-foreground",
    border: "border-border",
    dot: "bg-muted-foreground/40",
  },
};
