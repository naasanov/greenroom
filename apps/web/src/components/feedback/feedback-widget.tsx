"use client";

import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import {
  FEEDBACK_ERROR_CODES,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackRequest,
} from "@greenroom/shared";
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

function errorText(e: unknown): string {
  if (isApiError(e, 429)) {
    return "You have sent a lot of feedback recently. Please try again later.";
  }
  if (isApiError(e, 503) && e.code === FEEDBACK_ERROR_CODES.notConfigured) {
    return "Feedback is not set up on this server yet.";
  }
  return "We could not send your feedback. Please try again.";
}

/** Header icon button that opens a dialog for sending feedback as a GitHub issue. */
export function FeedbackWidget({ bandId }: { bandId?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMessage("");
      setSent(false);
      setError(null);
    }
  }

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const body: FeedbackRequest = {
      message: text,
      pageUrl: window.location.href.slice(0, 2000),
      userAgent: navigator.userAgent.slice(0, 500),
      bandId,
    };
    try {
      await api("/feedback", { method: "POST", body });
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
        onClick={() => setOpen(true)}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MessageSquarePlus className="size-5" />
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="feedback-dialog">
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
              <Label htmlFor="feedback-message">Message</Label>
              <Textarea
                id="feedback-message"
                value={message}
                maxLength={FEEDBACK_MESSAGE_MAX}
                disabled={sending}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened, or what would help?"
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="submit"
                  size="lg"
                  disabled={sending || !message.trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </Button>
              </DialogFooter>
            </form>
          )}
          {sent ? (
            <DialogFooter>
              <Button size="lg" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
