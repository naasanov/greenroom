"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePublicCalendarLink } from "@/lib/queries/public-calendar";

/** Copies the band's public calendar link; hidden until the link is available. */
export function CopyPublicCalendarLink({ bandId }: { bandId: string }) {
  const link = usePublicCalendarLink(bandId);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const url = link.data?.url;
  if (!url) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex justify-end pb-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="copy-public-calendar"
        className="text-muted-foreground"
        onClick={copy}
      >
        {copied ? <Check /> : <Link2 />}
        {copied ? "Copied" : "Copy public calendar link"}
      </Button>
    </div>
  );
}
