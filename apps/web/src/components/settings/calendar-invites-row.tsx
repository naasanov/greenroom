"use client";

import { useState } from "react";
import { CalendarInvitesDialog } from "@/components/calendar-invites/calendar-invites-dialog";
import {
  markInvitesOpened,
  useCalendarMethod,
} from "@/components/calendar-invites/invite-prefs";
import { Button } from "@/components/ui/button";

const STATUS = {
  email: "Email invites",
  feed: "Subscribe link",
  both: "Email invites and subscribe link",
} as const;

/** Settings row showing how the member gets events in their calendar, with a button to change it. */
export function CalendarInvitesRow({
  userId,
  bandId,
  invitesEnabled,
}: {
  userId: string;
  bandId: string;
  invitesEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const method = useCalendarMethod(userId, bandId, invitesEnabled);
  return (
    <div
      data-testid="calendar-invites-row"
      className="flex items-center justify-between gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">Calendar</span>
        <span
          data-testid="calendar-invites-status"
          className="text-xs text-muted-foreground"
        >
          {method ? STATUS[method] : "Off"}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        data-testid="calendar-invites-open"
        onClick={() => {
          markInvitesOpened(userId, bandId);
          setOpen(true);
        }}
      >
        Add to your calendar
      </Button>
      <CalendarInvitesDialog
        bandId={bandId}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
