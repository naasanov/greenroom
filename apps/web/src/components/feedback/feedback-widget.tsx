"use client";

import { MessageSquarePlus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_ERROR_CODES,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackCategory,
  type FeedbackRequest,
} from "@greenroom/shared";
import { NAV_TABS } from "@/components/app/app-shell";
import { NativeSelect } from "@/components/events/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api";

/** Label of the nav tab whose route contains the path, else "Other". */
function areaForPath(pathname: string): string {
  const segment = pathname.split("/")[1];
  return NAV_TABS.find((t) => t.key === segment)?.label ?? "Other";
}

function errorText(e: unknown): string {
  if (isApiError(e, 429)) {
    return "You have sent a lot of feedback recently. Please try again later.";
  }
  if (isApiError(e, 503) && e.code === FEEDBACK_ERROR_CODES.notConfigured) {
    return "Feedback is not set up on this server yet.";
  }
  return "We could not send your feedback. Please try again.";
}

/** Height of the visual viewport, which shrinks when the on-screen keyboard opens. */
function useVisualViewportHeight(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      setHeight(null);
    };
  }, [active]);
  return height;
}

/** Unsent text, kept at module scope so it survives closing and remounting. */
let draft = "";

/** Header icon button that opens a dialog for sending feedback as a GitHub issue. */
export function FeedbackWidget({ bandId }: { bandId?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(draft);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [area, setArea] = useState("Other");
  const pathname = usePathname();
  const viewportHeight = useVisualViewportHeight(open);

  // Form state resets on open, so the success view stays put while closing.
  function openDialog() {
    setSent(false);
    setError(null);
    setArea(areaForPath(pathname));
    setOpen(true);
  }

  const canSend = !sending && !!message.trim() && category !== "";

  async function send() {
    const text = message.trim();
    if (!canSend || !category) return;
    setSending(true);
    setError(null);
    const body: FeedbackRequest = {
      message: text,
      pageUrl: window.location.href.slice(0, 2000),
      userAgent: navigator.userAgent.slice(0, 500),
      bandId,
      category,
      area,
    };
    try {
      await api("/feedback", { method: "POST", body });
      draft = "";
      setMessage("");
      setCategory("");
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Send feedback"
        onClick={openDialog}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MessageSquarePlus className="size-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="feedback-dialog"
          style={
            viewportHeight
              ? { maxHeight: `${viewportHeight - 16}px` }
              : undefined
          }
          className="top-2 max-h-[calc(100dvh-1rem)] translate-y-0 overflow-y-auto overscroll-contain sm:top-1/2 sm:-translate-y-1/2"
        >
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Tell us about a bug, a rough edge, or something missing.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <p role="status" data-testid="feedback-sent" className="text-sm">
              Thanks! Your feedback was sent.
            </p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Label htmlFor="feedback-category">Category</Label>
              <NativeSelect
                id="feedback-category"
                value={category}
                required
                disabled={sending}
                onChange={(e) =>
                  setCategory(e.target.value as FeedbackCategory | "")
                }
              >
                <option value="" disabled>
                  Select a category
                </option>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
              <Label htmlFor="feedback-area">Area</Label>
              <NativeSelect
                id="feedback-area"
                value={area}
                disabled={sending}
                onChange={(e) => setArea(e.target.value)}
              >
                {[...NAV_TABS.map((t) => t.label), "Other", "N/A"].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </NativeSelect>
              <Label htmlFor="feedback-message">Message</Label>
              <Textarea
                id="feedback-message"
                value={message}
                maxLength={FEEDBACK_MESSAGE_MAX}
                disabled={sending}
                onChange={(e) => {
                  draft = e.target.value;
                  setMessage(draft);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                onFocus={(e) => {
                  const el = e.currentTarget;
                  setTimeout(() => el.scrollIntoView({ block: "center" }), 300);
                }}
                placeholder="What happened, or what would help?"
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" size="lg" disabled={!canSend}>
                  {sending ? "Sending..." : "Send"}
                </Button>
              </DialogFooter>
            </form>
          )}
          {sent ? (
            <DialogFooter>
              <Button size="lg" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
