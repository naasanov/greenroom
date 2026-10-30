"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api";
import { useCalendarSetup } from "@/lib/queries/google";

/** Creates the band calendar when opened and reports progress and the result. */
export function CalendarSetupDialog({
  bandId,
  open,
  onOpenChange,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setup = useCalendarSetup(bandId);
  const { mutate, reset } = setup;
  const started = useRef(false);

  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      mutate();
    }
    if (!open) {
      started.current = false;
      reset();
    }
  }, [open, mutate, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !setup.isPending && onOpenChange(next)}
    >
      <DialogContent data-testid="calendar-setup">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Google Calendar
          </DialogTitle>
          <DialogDescription>
            Gigs and practices stay in sync with your band calendar.
          </DialogDescription>
        </DialogHeader>
        {setup.isError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-destructive">
              {isApiError(setup.error, 409)
                ? "Calendar sync is not available yet. Please try again later."
                : "We could not set up your calendar. Please try again."}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => mutate()}>Try again</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : setup.isSuccess ? (
          <div className="flex flex-col gap-3">
            <p
              role="status"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <CheckCircle2 className="size-4 text-primary" />
              Your band calendar is ready.
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Setting up your band calendar...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
