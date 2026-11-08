"use client";

import { CalendarPlus } from "lucide-react";
import { ADD_TO_CALENDAR_LABEL } from "@/components/calendar-invites/calendar-invites-dialog";
import { Button } from "@/components/ui/button";

/** Toolbar icon button that opens the calendar invites dialog. */
export function AddToCalendarButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={ADD_TO_CALENDAR_LABEL}
      title={ADD_TO_CALENDAR_LABEL}
      data-testid="add-to-calendar"
      className="text-muted-foreground"
      onClick={onClick}
    >
      <CalendarPlus />
    </Button>
  );
}
