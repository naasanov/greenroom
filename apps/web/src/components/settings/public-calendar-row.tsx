"use client";

import {
  PUBLIC_CALENDAR_DESCRIPTION,
  PUBLIC_CALENDAR_TITLE,
  PublicCalendarPanel,
} from "@/components/app/public-calendar-panel";

/** Admin-only public gig calendar link with copy and reset. */
export function PublicCalendarRow({ bandId }: { bandId: string }) {
  return (
    <div
      className="flex flex-col gap-3 border-t pt-5"
      data-testid="public-calendar-row"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{PUBLIC_CALENDAR_TITLE}</h3>
        <p className="text-xs text-muted-foreground">
          {PUBLIC_CALENDAR_DESCRIPTION}
        </p>
      </div>
      <PublicCalendarPanel bandId={bandId} canReset />
    </div>
  );
}
