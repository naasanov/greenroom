"use client";

import { CalendarDays, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { connectGoogle, useGoogleIntegrations } from "@/lib/queries/google";
import { createLocalChoice } from "@/lib/use-local-choice";

const useBannerChoice = createLocalChoice<"show" | "dismissed">(
  "greenroom:calendar-banner",
  ["show", "dismissed"],
  "show",
);

/** Dismissible Events tab banner offering to connect Google Calendar. */
export function CalendarBanner({ bandId }: { bandId: string }) {
  const [choice, setChoice] = useBannerChoice();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const integrations = useGoogleIntegrations(bandId);
  if (choice === "dismissed" || !integrations.data) return null;
  if (integrations.data.calendar.linked) return null;

  return (
    <div
      data-testid="calendar-banner"
      className="mb-3 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3"
    >
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">
        Keep your Google Calendar in sync with gigs and practices.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          connectGoogle(
            bandId,
            "calendar",
            search ? `${pathname}?${search}` : pathname,
          )
        }
      >
        Connect
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
  );
}
