"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useCalendarFeed,
  useRotateCalendarFeed,
  useSaveCalendarPrefs,
} from "@/lib/queries/calendar-invites";
import { useMe } from "@/lib/queries";

export const ADD_TO_CALENDAR_LABEL = "Add to your calendar";

/** Opt-out switch; saves immediately. */
export function InvitesToggle({ enabled }: { enabled: boolean }) {
  const save = useSaveCalendarPrefs();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor="calendar-invites-toggle"
          className="text-sm font-medium"
        >
          Email me calendar invites
        </Label>
        <p className="text-xs text-muted-foreground">
          Every gig and practice arrives as a standard invite you can accept in
          any calendar app, and updates itself when the event changes.
        </p>
      </div>
      <Switch
        id="calendar-invites-toggle"
        data-testid="calendar-invites-toggle"
        checked={enabled}
        disabled={save.isPending}
        onCheckedChange={(next) =>
          save.mutate({ calendarInvitesEnabled: next })
        }
      />
    </div>
  );
}

function CalendarEmailField({
  current,
  signIn,
}: {
  current: string;
  signIn: string;
}) {
  const save = useSaveCalendarPrefs();
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);
  const dirty = value.trim().toLowerCase() !== current;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (next !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate({ calendarEmail: next === "" ? null : next });
  }

  return (
    <form noValidate onSubmit={submit}>
      <FormField
        label="Calendar email"
        htmlFor="calendar-invites-email"
        hint="Invites go here. Leave empty to use your sign-in email."
      >
        <div className="flex gap-2">
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
          <Button
            type="submit"
            variant="outline"
            disabled={save.isPending || !dirty}
          >
            Save
          </Button>
        </div>
        {invalid ? (
          <p role="alert" className="text-sm text-destructive">
            Enter a valid email address.
          </p>
        ) : save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            We could not save your calendar email. Please try again.
          </p>
        ) : null}
      </FormField>
    </form>
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
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          Or subscribe with a private link
        </h3>
        <p className="text-xs text-muted-foreground">
          Your calendar app checks this link for changes. It is only for you, so
          do not share it. Updates can take a few hours to show up.
        </p>
      </div>
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

/** The single "Add to your calendar" dialog: invites, calendar email and the private feed. */
export function CalendarInvitesDialog({
  bandId,
  open,
  onOpenChange,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            Get your band&apos;s gigs and practices in the calendar you already
            use.
          </DialogDescription>
        </DialogHeader>
        {me ? (
          <div className="flex flex-col gap-5">
            <InvitesToggle enabled={me.calendarInvitesEnabled} />
            <CalendarEmailField
              key={me.calendarEmail ?? ""}
              current={me.calendarEmail ?? ""}
              signIn={me.email}
            />
            <FeedSection bandId={bandId} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
