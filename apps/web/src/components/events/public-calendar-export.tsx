"use client";

import { Share } from "lucide-react";
import {
  PUBLIC_CALENDAR_DESCRIPTION,
  PUBLIC_CALENDAR_TITLE,
  PublicCalendarPanel,
} from "@/components/app/public-calendar-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrentBand } from "@/lib/current-band";
import { usePublicCalendarLink } from "@/lib/queries/public-calendar";

/** Export icon opening the public calendar link dialog; hidden until the link loads. */
export function PublicCalendarExport({ bandId }: { bandId: string }) {
  const link = usePublicCalendarLink(bandId);
  const { currentBand } = useCurrentBand();
  if (!link.data?.url) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Export public calendar"
          data-testid="public-calendar-export"
          className="text-muted-foreground"
        >
          <Share />
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="public-calendar-dialog">
        <DialogHeader>
          <DialogTitle>{PUBLIC_CALENDAR_TITLE}</DialogTitle>
          <DialogDescription>{PUBLIC_CALENDAR_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <PublicCalendarPanel
          bandId={bandId}
          canReset={currentBand?.role === "admin"}
        />
      </DialogContent>
    </Dialog>
  );
}
