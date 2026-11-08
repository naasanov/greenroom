"use client";

import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInvitesBanner } from "@/components/calendar-invites/invite-prefs";
import { useMe } from "@/lib/queries";

/**
 * Events tab prompt to add gigs and practices to the member's calendar. The
 * nudge variant (after the member's first event) shares the slot and ignores
 * the banner's own dismissal state.
 */
export function CalendarInvitesBanner({
  bandId,
  nudge,
  onNudgeDismiss,
  onOpen,
}: {
  bandId: string;
  nudge: boolean;
  onNudgeDismiss: () => void;
  onOpen: () => void;
}) {
  const me = useMe().data;
  const banner = useInvitesBanner(me?.id, bandId, me?.calendarInvitesEnabled);
  if (!nudge && banner.hidden) return null;

  return (
    <div
      data-testid={nudge ? "calendar-nudge" : "calendar-banner"}
      className="mb-3 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3"
    >
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">
        {nudge
          ? "Nice, your first event is in. Want it in your calendar too?"
          : "Get gigs and practices in your calendar."}
      </p>
      <Button size="sm" onClick={onOpen}>
        Add to your calendar
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Dismiss"
        onClick={nudge ? onNudgeDismiss : banner.dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
