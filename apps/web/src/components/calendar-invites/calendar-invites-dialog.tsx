"use client";

import { ArrowLeft, Check, Copy, ExternalLink, Mail, Rss } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCalendarFeed,
  useRotateCalendarFeed,
  useSaveCalendarPrefs,
} from "@/lib/queries/calendar-invites";
import { useMe } from "@/lib/queries";
import {
  setFeedInUse,
  useCalendarMethod,
} from "@/components/calendar-invites/invite-prefs";

export const ADD_TO_CALENDAR_LABEL = "Add to your calendar";

function EmailStep({
  enabled,
  current,
  signIn,
}: {
  enabled: boolean;
  current: string;
  signIn: string;
}) {
  const save = useSaveCalendarPrefs();
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);
  const dirty = value.trim() !== current;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (next !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate({
      calendarInvitesEnabled: true,
      calendarEmail: next === "" ? null : next,
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="calendar-step-email">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm">
          Invites go to{" "}
          <span data-testid="calendar-account-email" className="font-medium">
            {current || signIn}
          </span>
          . Your next 5 events arrive by email now, and the subscribe link shows
          the full schedule.
        </p>
        <FormField
          label="Use a different email (optional)"
          htmlFor="calendar-invites-email"
          hint="For a calendar on another address, such as Outlook."
        >
          <Input
            id="calendar-invites-email"
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder={signIn}
            value={value}
            aria-invalid={invalid}
            onChange={(e) => {
              setValue(e.target.value);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <p role="alert" className="text-sm text-destructive">
              Enter a valid email address.
            </p>
          ) : save.isError ? (
            <p role="alert" className="text-sm text-destructive">
              We could not save this. Please try again.
            </p>
          ) : null}
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            data-testid="calendar-invites-save"
            disabled={save.isPending || (enabled && !dirty)}
          >
            {enabled ? "Save email" : "Turn on email invites"}
          </Button>
          {enabled ? (
            <Button
              type="button"
              variant="outline"
              data-testid="calendar-invites-off"
              disabled={save.isPending}
              onClick={() => save.mutate({ calendarInvitesEnabled: false })}
            >
              Turn off invites
            </Button>
          ) : null}
        </div>
      </form>
      {enabled ? (
        <p
          role="status"
          data-testid="calendar-invites-on"
          className="text-xs text-muted-foreground"
        >
          Email invites are on. Accept them in any calendar app.
        </p>
      ) : null}
    </div>
  );
}

function FeedSection({ bandId }: { bandId: string }) {
  const feed = useCalendarFeed(bandId);
  const rotate = useRotateCalendarFeed(bandId);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const url = feed.data?.url ?? "";

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
    <section className="flex flex-col gap-3" data-testid="calendar-feed">
      <p className="text-xs text-muted-foreground">
        Add this link to your calendar app. It is only for you, so do not share
        it. Updates can take a few hours to show up.
      </p>
      <Input
        readOnly
        aria-label="Calendar feed link"
        data-testid="calendar-feed-url"
        value={feed.isLoading ? "Loading..." : url}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy} disabled={!url}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {feed.data ? (
          <Button variant="outline" asChild>
            <a href={feed.data.webcalUrl} data-testid="calendar-feed-webcal">
              <ExternalLink />
              Open in calendar app
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={!url || rotate.isPending}
          onClick={() => setConfirmReset(true)}
        >
          Reset link
        </Button>
      </div>
      {feed.isError || rotate.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong with your calendar link. Please try again.
        </p>
      ) : null}
      <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
        <li>Google Calendar: Other calendars, then From URL.</li>
        <li>Outlook: Add calendar, then Subscribe from web.</li>
        <li>Apple Calendar: File, then New Calendar Subscription.</li>
      </ul>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset your calendar link?"
        description="The current link stops working. Calendars subscribed with it need the new link."
        confirmLabel="Reset link"
        destructive
        onConfirm={() => rotate.mutate()}
      />
    </section>
  );
}

function ChoiceCard({
  testId,
  icon,
  title,
  body,
  current,
  onClick,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">
          {title}
          {current ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              In use
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

type Step = "choice" | "email" | "feed";

/**
 * Two-step flow. A member already using a method opens straight onto its
 * step (email wins when both are in use) and can go Back to switch.
 * `startAtChoice` always opens on the chooser.
 */
function CalendarFlow({
  bandId,
  startAtChoice,
}: {
  bandId: string;
  startAtChoice: boolean;
}) {
  const me = useMe().data!;
  const method = useCalendarMethod(me.id, bandId, me.calendarInvitesEnabled);
  const [step, setStep] = useState<Step>(
    startAtChoice
      ? "choice"
      : method === "email" || method === "both"
        ? "email"
        : method === "feed"
          ? "feed"
          : "choice",
  );
  const usesEmail = method === "email" || method === "both";
  const usesFeed = method === "feed" || method === "both";

  const back = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="calendar-back"
      className="-ml-2 w-fit"
      onClick={() => setStep("choice")}
    >
      <ArrowLeft />
      Back
    </Button>
  );

  if (step === "email") {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmailStep
          enabled={me.calendarInvitesEnabled}
          current={me.calendarEmail ?? ""}
          signIn={me.email}
        />
      </div>
    );
  }
  if (step === "feed") {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <FeedSection bandId={bandId} />
        {usesFeed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="calendar-feed-stop"
            className="w-fit"
            onClick={() => {
              setFeedInUse(me.id, bandId, false);
              setStep("choice");
            }}
          >
            I no longer use this link
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ChoiceCard
        testId="calendar-choice-email"
        icon={<Mail className="size-5" />}
        title="Email invites"
        body="Each gig and practice arrives as a standard invite you accept in any calendar app. Your RSVPs flow back to Greenroom, and changes arrive by email."
        current={usesEmail}
        onClick={() => setStep("email")}
      />
      <ChoiceCard
        testId="calendar-choice-feed"
        icon={<Rss className="size-5" />}
        title="Subscribe link"
        body="Every event shows up in your calendar on its own, with nothing to accept. It is read-only, RSVPs do not flow back, and calendar apps refresh it slowly."
        current={usesFeed}
        onClick={() => {
          setFeedInUse(me.id, bandId, true);
          setStep("feed");
        }}
      />
    </div>
  );
}

/** The "Add to your calendar" dialog: pick email invites or a subscribe link, then set it up. */
export function CalendarInvitesDialog({
  bandId,
  open,
  onOpenChange,
  startAtChoice = false,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startAtChoice?: boolean;
}) {
  const me = useMe().data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="calendar-invites-dialog"
        className="max-h-[85dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{ADD_TO_CALENDAR_LABEL}</DialogTitle>
          <DialogDescription>
            Optional. Pick how you want your band&apos;s gigs and practices to
            reach the calendar you already use.
          </DialogDescription>
        </DialogHeader>
        {me ? <CalendarFlow bandId={bandId} startAtChoice={startAtChoice} /> : null}
      </DialogContent>
    </Dialog>
  );
}
