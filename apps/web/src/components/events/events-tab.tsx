"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarEvent,
  Gig,
  PracticeEditResult,
  PracticeOccurrence,
} from "@greenroom/shared";
import { Fab } from "@/components/app/fab";
import { AgendaButton, AgendaSheet } from "@/components/events/agenda-sheet";
import {
  CreateEventDrawer,
  type CreatedEvent,
} from "@/components/events/create-drawer";
import {
  EventCalendar,
  type CalendarMode,
} from "@/components/events/event-calendar";
import { CalendarBanner } from "@/components/google/calendar-banner";
import { GoogleLinkReturn } from "@/components/google/google-link-return";
import { GigDrawer } from "@/components/events/gig-drawer";
import { PracticeDrawer } from "@/components/events/practice-drawer";
import { NoAccess } from "@/components/onboarding/deep-link-views";
import { cn } from "@/lib/utils";
import { useCurrentBand } from "@/lib/current-band";
import { useDrawerStack } from "@/lib/use-drawer-stack";
import { createLocalChoice } from "@/lib/use-local-choice";
import { keys, useGig, usePracticeOccurrence } from "@/lib/queries";
import {
  useEvents,
  useGigLinkFor,
  usePracticeLinkFor,
} from "@/lib/queries/events";

const useCalendarMode = createLocalChoice<CalendarMode>(
  "greenroom:calendar-mode",
  ["month", "week"],
  "month",
);

// ---- URL-driven selection ----

type Selection =
  | { kind: "gig"; gigId: string }
  | { kind: "practice"; seriesId: string; date: string | null };

function parseSelection(
  pathname: string,
  date: string | null,
): Selection | null {
  const [, seg, id] = pathname.split("/");
  if (seg === "gigs" && id) return { kind: "gig", gigId: id };
  if (seg === "practices" && id) {
    return { kind: "practice", seriesId: id, date };
  }
  return null;
}

function pathOf(sel: Selection | null): string {
  if (!sel) return "/events";
  if (sel.kind === "gig") return `/gigs/${sel.gigId}`;
  return `/practices/${sel.seriesId}${sel.date ? `?date=${sel.date}` : ""}`;
}

/** Identity of a selection, independent of the URL's spelling. */
function keyOf(sel: Selection | null): string {
  if (!sel) return "none";
  return sel.kind === "gig"
    ? `gig:${sel.gigId}`
    : `practice:${sel.seriesId}:${sel.date ?? ""}`;
}

/** What an event drawer renders; frozen while the drawer slides away. */
interface EventDrawerData {
  sel: Selection;
  bandId: string;
  gig?: Gig;
  occurrenceKey?: string;
  occ?: PracticeOccurrence;
  fallbackTitle?: string;
}

/**
 * The Events tab: calendar, create drawer and the event drawer. The open event
 * mirrors the URL (`/gigs/:id`, `/practices/:id?date=`), but opening and closing
 * update local state first so the drawer never waits on a navigation.
 */
export function EventsTab({ focusDate: focusProp }: { focusDate?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const qc = useQueryClient();
  const { currentBand, setCurrentBandId } = useCurrentBand();
  const bandId = currentBand?.id;
  const [mode, setMode] = useCalendarMode();

  // Selection: local state mirrors the URL; `pending` holds a navigation we started.
  const urlSelection = parseSelection(pathname, search.get("date"));
  const urlKey = keyOf(urlSelection);
  const [sel, setSel] = useState<Selection | null>(urlSelection);
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);
  const [pending, setPending] = useState<string | null>(null);
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    if (pending !== null) {
      if (pending === urlKey) setPending(null);
    } else {
      setSel(urlSelection);
    }
  }
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  const go = useCallback(
    (next: Selection | null, how: "push" | "replace") => {
      selRef.current = next;
      setSel(next);
      setPending(keyOf(next) === urlKey ? null : keyOf(next));
      router[how](pathOf(next));
    },
    [router, urlKey],
  );

  /** Closes `target` only if it is still the open event (late outside-tap closes are ignored). */
  const close = useCallback(
    (target: Selection) => {
      if (keyOf(selRef.current) !== keyOf(target)) return;
      go(null, "replace");
    },
    [go],
  );

  // Resolve the selection to a band and read its data.
  const gigLink = useGigLinkFor(sel?.kind === "gig" ? sel.gigId : null);
  const practiceLink = usePracticeLinkFor(
    sel?.kind === "practice" ? sel.seriesId : null,
    sel?.kind === "practice" ? sel.date : null,
  );
  const link = sel?.kind === "gig" ? gigLink : practiceLink;
  const linkBandId = link.data?.bandId;
  const gig = useGig(
    sel?.kind === "gig" ? linkBandId : undefined,
    sel?.kind === "gig" ? sel.gigId : "",
  );
  const occKey =
    practiceLink.data && sel?.kind === "practice"
      ? practiceLink.data.occurrenceKey
      : null;
  const occ = usePracticeOccurrence(
    sel?.kind === "practice" ? linkBandId : undefined,
    sel?.kind === "practice" ? sel.seriesId : "",
    occKey,
  );

  // A link into another band switches to it once; a later manual switch closes the drawer.
  const adopted = useRef<string | null>(null);
  const prevBand = useRef(bandId);
  useEffect(() => {
    const was = prevBand.current;
    prevBand.current = bandId;
    if (!sel || !linkBandId) return;
    const key = keyOf(sel);
    if (adopted.current !== key) {
      adopted.current = key;
      if (bandId !== linkBandId) setCurrentBandId(linkBandId);
      return;
    }
    if (was === linkBandId && bandId !== linkBandId) close(sel);
  }, [sel, linkBandId, bandId, setCurrentBandId, close]);

  // Calendar data.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const events = useEvents(bandId, range);
  const onRangeChange = useCallback(
    (next: { from: string; to: string }) =>
      setRange((r) => (r?.from === next.from && r.to === next.to ? r : next)),
    [],
  );
  const eventList = useMemo(() => events.data ?? [], [events.data]);
  const fallbackTitle = useMemo(() => {
    if (!sel) return undefined;
    return eventList.find((e) =>
      sel.kind === "gig"
        ? e.id === sel.gigId
        : e.type === "practice" && e.seriesId === sel.seriesId,
    )?.title;
  }, [eventList, sel]);

  // Create drawer.
  const [create, setCreate] = useState({ open: false, date: "", nonce: 0 });
  const openCreate = (date: string) => {
    if (selRef.current) go(null, "replace");
    setCreate((c) => ({ open: true, date, nonce: c.nonce + 1 }));
  };
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState<string | undefined>();
  // Agenda taps blank the focus for one commit, then jump, so a repeat tap re-navigates.
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    if (jumpDate !== "" || !pendingJump.current) return;
    const next = pendingJump.current;
    pendingJump.current = null;
    setJumpDate(next);
  }, [jumpDate]);

  // Event drawers stay mounted while sliding away so a replacement overlaps them.
  const [instantKey, setInstantKey] = useState<string | null>(null);
  const eventDrawer: EventDrawerData | null =
    sel?.kind === "gig" && gigLink.data
      ? {
          sel,
          bandId: gigLink.data.bandId,
          gig: gig.data,
          fallbackTitle,
        }
      : sel?.kind === "practice" && practiceLink.data && occKey
        ? {
            sel,
            bandId: practiceLink.data.bandId,
            occurrenceKey: occKey,
            occ: occ.data,
            fallbackTitle,
          }
        : null;
  const selKey = keyOf(sel);
  if (instantKey && selKey !== instantKey) setInstantKey(null);
  const drawerEntries = useDrawerStack<EventDrawerData>(
    eventDrawer && sel
      ? {
          key: keyOf(sel),
          data: eventDrawer,
          instant: keyOf(sel) === instantKey,
        }
      : null,
  );

  function openEvent(ev: CalendarEvent) {
    if (!bandId) return;
    if (ev.type === "gig") {
      qc.setQueryData(keys.link("gigs", ev.id), { bandId, gigId: ev.id });
      go({ kind: "gig", gigId: ev.id }, "push");
    } else {
      qc.setQueryData(keys.link("practices", ev.seriesId, ev.date), {
        bandId,
        seriesId: ev.seriesId,
        occurrenceKey: ev.occurrenceKey,
      });
      go({ kind: "practice", seriesId: ev.seriesId, date: ev.date }, "push");
    }
  }

  /** Agenda taps always bring the event's date into view, even when re-selecting. */
  function selectFromAgenda(ev: CalendarEvent) {
    pendingJump.current = ev.date;
    setJumpDate("");
    openEvent(ev);
  }

  function selectFromCalendar(ev: CalendarEvent) {
    setJumpDate(undefined);
    openEvent(ev);
  }

  /** Hands the create drawer off to the new event's drawer and shows its date. */
  function openCreated(created: CreatedEvent) {
    if (!bandId) return;
    if (created.kind === "gig") {
      const { gig: made } = created;
      qc.setQueryData(keys.gig(bandId, made.id), made);
      qc.setQueryData(keys.link("gigs", made.id), {
        bandId,
        gigId: made.id,
      });
      setJumpDate(made.date);
      go({ kind: "gig", gigId: made.id }, "push");
    } else {
      const { series } = created;
      setJumpDate(series.startDate);
      go(
        { kind: "practice", seriesId: series.id, date: series.startDate },
        "push",
      );
    }
  }

  function followEdit(result: PracticeEditResult) {
    const next = result.occurrence;
    if (!bandId || !next) return go(null, "replace");
    setInstantKey(
      keyOf({ kind: "practice", seriesId: next.seriesId, date: next.date }),
    );
    qc.setQueryData(keys.link("practices", next.seriesId, next.date), {
      bandId,
      seriesId: next.seriesId,
      occurrenceKey: next.occurrenceKey,
    });
    go(
      { kind: "practice", seriesId: next.seriesId, date: next.date },
      "replace",
    );
  }

  if (link.isError && sel) return <NoAccess error={link.error} tab="events" />;

  const focusDate =
    jumpDate === ""
      ? undefined
      : (jumpDate ??
        (sel?.kind === "gig"
          ? gig.data?.date
          : sel?.kind === "practice"
            ? (occ.data?.date ?? sel.date ?? undefined)
            : undefined) ??
        focusProp);

  return (
    <div
      className={cn(
        "transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        agendaOpen && "md:pr-[26rem]",
      )}
    >
      <div
        data-testid="events-tab"
        data-focus-date={focusDate}
        className="mx-auto w-full max-w-5xl px-3 py-4 pb-28 md:pb-24"
      >
        {bandId ? (
          <>
            <CalendarBanner bandId={bandId} />
            <GoogleLinkReturn bandId={bandId} />
          </>
        ) : null}
        {practiceLink.data && sel?.kind === "practice" && occKey === null ? (
          <p
            role="status"
            className="mx-auto mb-3 w-fit rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground"
          >
            This practice has no occurrence on that date.
          </p>
        ) : null}

        <EventCalendar
          mode={mode}
          onModeChange={setMode}
          focusDate={focusDate}
          events={eventList}
          onRangeChange={onRangeChange}
          onDayClick={openCreate}
          onEventClick={selectFromCalendar}
          selectedEvent={
            sel?.kind === "gig"
              ? { type: "gig", id: sel.gigId }
              : sel
                ? { type: "practice", seriesId: sel.seriesId, date: sel.date }
                : null
          }
        />

        {agendaOpen ? null : (
          <>
            <AgendaButton onClick={() => setAgendaOpen(true)} />
            <Fab label="Add event" onClick={() => openCreate("")} />
          </>
        )}

        <AgendaSheet
          open={agendaOpen}
          onOpenChange={setAgendaOpen}
          bandId={bandId}
          onSelect={selectFromAgenda}
        />

        {bandId ? (
          <CreateEventDrawer
            key={create.nonce}
            bandId={bandId}
            open={create.open}
            defaultDate={create.date}
            beside={agendaOpen}
            onOpenChange={(open) => setCreate((c) => ({ ...c, open }))}
            onCreated={openCreated}
          />
        ) : null}

        {drawerEntries.map((entry) => {
          const { sel: target, bandId: drawerBand } = entry.data;
          return target.kind === "gig" ? (
            <GigDrawer
              key={entry.id}
              open={entry.open}
              beside={agendaOpen}
              bandId={drawerBand}
              gigId={target.gigId}
              gig={entry.data.gig}
              fallbackTitle={entry.data.fallbackTitle}
              onClose={() => close(target)}
            />
          ) : (
            <PracticeDrawer
              key={entry.id}
              open={entry.open}
              beside={agendaOpen}
              bandId={drawerBand}
              seriesId={target.seriesId}
              occurrenceKey={entry.data.occurrenceKey!}
              occ={entry.data.occ}
              fallbackTitle={entry.data.fallbackTitle}
              onClose={() => close(target)}
              onEdited={followEdit}
            />
          );
        })}
      </div>
    </div>
  );
}
