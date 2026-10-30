"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  usePublicCalendarLink,
  useResetPublicCalendarLink,
} from "@/lib/queries/public-calendar";

/** Admin-only public gig calendar link with copy and reset. */
export function PublicCalendarRow({ bandId }: { bandId: string }) {
  const link = usePublicCalendarLink(bandId);
  const reset = useResetPublicCalendarLink(bandId);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const url = link.data?.url ?? "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked: the field stays selectable for a manual copy.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="flex flex-col gap-3 border-t pt-5"
      data-testid="public-calendar-row"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">Public gig calendar</h3>
        <p className="text-xs text-muted-foreground">
          A view-only page with your upcoming shows. Anyone with the link can
          see it, for example from your Instagram bio.
        </p>
      </div>
      <Input
        readOnly
        aria-label="Public calendar link"
        value={link.isLoading ? "Loading..." : url}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy} disabled={!url}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!url || reset.isPending}
          onClick={() => setConfirmReset(true)}
        >
          Reset link
        </Button>
      </div>
      {reset.isError || link.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong with the public link. Please try again.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset public calendar link?"
        description="The current link stops working. Anywhere you shared it, such as your Instagram bio, needs the new one."
        confirmLabel="Reset link"
        destructive
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}
