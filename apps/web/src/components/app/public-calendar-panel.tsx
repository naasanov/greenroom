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

export const PUBLIC_CALENDAR_TITLE = "Public gig calendar";
export const PUBLIC_CALENDAR_DESCRIPTION =
  "A view-only page with your upcoming shows. Anyone with the link can see it, for example from your Instagram bio.";

/** Link field with copy and (for admins) reset, shared by settings and the events dialog. */
export function PublicCalendarPanel({
  bandId,
  canReset,
}: {
  bandId: string;
  canReset: boolean;
}) {
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
    <div className="flex flex-col gap-3">
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
        {canReset ? (
          <Button
            type="button"
            variant="outline"
            disabled={!url || reset.isPending}
            onClick={() => setConfirmReset(true)}
          >
            Reset link
          </Button>
        ) : null}
      </div>
      {reset.isError || link.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong with the public link. Please try again.
        </p>
      ) : null}
      {canReset ? (
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Reset public calendar link?"
          description="The current link stops working. Anywhere you shared it, such as your Instagram bio, needs the new one."
          confirmLabel="Reset link"
          destructive
          onConfirm={() => reset.mutate()}
        />
      ) : null}
    </div>
  );
}
