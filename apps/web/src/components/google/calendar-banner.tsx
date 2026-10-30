"use client";

import { CalendarDays, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarSetupDialog } from "@/components/google/calendar-setup-dialog";
import { useGoogleIntegrations } from "@/lib/queries/google";
import { createLocalChoice } from "@/lib/use-local-choice";

const useBannerChoice = createLocalChoice<"show" | "dismissed">(
  "greenroom:calendar-banner",
  ["show", "dismissed"],
  "show",
);

/** Dismissible Events tab banner offering to sync with Google Calendar. */
export function CalendarBanner({ bandId }: { bandId: string }) {
  const [choice, setChoice] = useBannerChoice();
  const [setup, setSetup] = useState(false);
  const integrations = useGoogleIntegrations(bandId);
  const hidden =
    choice === "dismissed" ||
    !integrations.data ||
    integrations.data.calendar.linked;

  // The dialog stays mounted after setup so it can show the result.
  return (
    <>
      {hidden ? null : (
        <div
          data-testid="calendar-banner"
          className="mb-3 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3"
        >
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm">
            Sync gigs and practices to a shared Google Calendar. Members get it
            by email.
          </p>
          <Button size="sm" variant="outline" onClick={() => setSetup(true)}>
            Sync
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Dismiss"
            onClick={() => setChoice("dismissed")}
          >
            <X />
          </Button>
        </div>
      )}
      <CalendarSetupDialog
        bandId={bandId}
        open={setup}
        onOpenChange={setSetup}
      />
    </>
  );
}
