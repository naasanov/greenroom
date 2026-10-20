"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const FEEDBACK_MS = 2000;

/**
 * Icon button that shares an absolute link: the native share sheet on touch
 * devices that have one, otherwise a clipboard copy with inline feedback.
 */
export function ShareButton({
  path,
  title,
  className,
}: {
  path: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function share() {
    const url = `${window.location.origin}${path}`;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Share link"
        onClick={share}
        className={className}
      >
        {copied ? <Check className="text-primary" /> : <Share2 />}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </>
  );
}
