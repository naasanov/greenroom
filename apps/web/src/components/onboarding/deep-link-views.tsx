"use client";

import { Link2Off, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { Gig, PracticeOccurrence, SongDetail } from "@greenroom/shared";
import {
  BottomDrawer,
  type BottomDrawerProps,
} from "@/components/app/bottom-drawer";
import { EmptyState } from "@/components/app/empty-state";
import { EVENT_TYPES } from "@/components/app/event-types";
import { RightSheet } from "@/components/app/right-sheet";
import { ShareButton } from "@/components/app/share-button";
import { Button } from "@/components/ui/button";
import { EventsTab } from "@/components/onboarding/events-tab";
import { LibraryTab } from "@/components/onboarding/library-tab";
import { useCurrentBand } from "@/lib/current-band";
import { isApiError } from "@/lib/api";
import {
  useGig,
  useGigLink,
  usePracticeLink,
  usePracticeOccurrence,
  useSong,
  useSongLink,
} from "@/lib/queries";

/** Switches the current band to the link's band once, when it differs. */
function useAdoptBand(bandId: string | undefined) {
  const { currentBand, setCurrentBandId } = useCurrentBand();
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!bandId || adopted.current === bandId) return;
    adopted.current = bandId;
    if (currentBand?.id !== bandId) setCurrentBandId(bandId);
  }, [bandId, currentBand?.id, setCurrentBandId]);
}

/** An event drawer that is open for as long as the link view shows it. */
function DeepLinkDrawer(props: Omit<BottomDrawerProps, "open">) {
  return <BottomDrawer {...props} open />;
}

function NoAccess({
  error,
  tab,
}: {
  error: unknown;
  tab: "events" | "library";
}) {
  const missing = isApiError(error, 404);
  return (
    <EmptyState
      className="py-24"
      icon={Link2Off}
      title={
        missing
          ? "This link doesn't exist or you don't have access"
          : "Something went wrong"
      }
      description={
        missing
          ? "Ask a bandmate to send the link again."
          : "Please reload and try again."
      }
      action={
        <Button asChild variant="secondary">
          <Link href={`/${tab}`}>
            {tab === "events" ? "Go to Events" : "Go to Music Library"}
          </Link>
        </Button>
      }
    />
  );
}

function Pending() {
  return (
    <div className="flex justify-center py-24">
      <Loader2
        aria-label="Loading"
        className="size-6 animate-spin text-muted-foreground"
      />
    </div>
  );
}

const fmt = (
  date: Date,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions,
): string =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);

/** "Sat, Nov 7" or "Sat, Nov 7, 8:00 PM - 10:00 PM" in the event's zone. */
function whenLabel(e: {
  date: string;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
}): string {
  const day = fmt(new Date(`${e.date}T12:00:00Z`), "UTC", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (e.allDay || !e.startsAt) return `${day} (all day)`;
  const time = { hour: "numeric", minute: "2-digit" } as const;
  const start = fmt(new Date(e.startsAt), e.timeZone, time);
  const end = e.endsAt ? fmt(new Date(e.endsAt), e.timeZone, time) : null;
  return `${day}, ${end ? `${start} - ${end}` : start}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function GigDetail({ gig }: { gig: Gig }) {
  return (
    <dl className="flex flex-col gap-4 pt-2">
      <Fact label="When">{whenLabel(gig)}</Fact>
      {gig.venueName ? <Fact label="Venue">{gig.venueName}</Fact> : null}
    </dl>
  );
}

function PracticeDetail({ occ }: { occ: PracticeOccurrence }) {
  return (
    <dl className="flex flex-col gap-4 pt-2">
      <Fact label="When">{whenLabel(occ)}</Fact>
      {occ.location ? <Fact label="Location">{occ.location}</Fact> : null}
    </dl>
  );
}

export function GigLinkView({ gigId }: { gigId: string }) {
  const router = useRouter();
  const link = useGigLink(gigId);
  useAdoptBand(link.data?.bandId);
  const gig = useGig(link.data?.bandId, gigId);

  if (link.isError) return <NoAccess error={link.error} tab="events" />;
  return (
    <>
      <EventsTab focusDate={gig.data?.date} />
      {gig.data ? (
        <DeepLinkDrawer
          onOpenChange={(o) => !o && router.replace("/events")}
          title={gig.data.title}
          description={EVENT_TYPES.gig.label}
          headerAction={
            <ShareButton path={`/gigs/${gigId}`} title={gig.data.title} />
          }
        >
          <GigDetail gig={gig.data} />
        </DeepLinkDrawer>
      ) : link.isError || gig.isError ? null : (
        <Pending />
      )}
    </>
  );
}

export function PracticeLinkView({
  seriesId,
  date,
}: {
  seriesId: string;
  date: string | null;
}) {
  const router = useRouter();
  const link = usePracticeLink(seriesId, date);
  useAdoptBand(link.data?.bandId);
  const key = link.data?.occurrenceKey;
  const occ = usePracticeOccurrence(link.data?.bandId, seriesId, key);

  if (link.isError) return <NoAccess error={link.error} tab="events" />;
  return (
    <>
      <EventsTab focusDate={occ.data?.date ?? date ?? undefined} />
      {link.data && key === null ? (
        <p
          role="status"
          className="mx-auto mt-4 w-fit rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground"
        >
          This practice has no occurrence on that date.
        </p>
      ) : null}
      {occ.data ? (
        <DeepLinkDrawer
          onOpenChange={(o) => !o && router.replace("/events")}
          title={occ.data.title}
          description={EVENT_TYPES.practice.label}
          headerAction={
            <ShareButton
              path={`/practices/${seriesId}?date=${occ.data.date}`}
              title={occ.data.title}
            />
          }
        >
          <PracticeDetail occ={occ.data} />
        </DeepLinkDrawer>
      ) : null}
    </>
  );
}

function SongBody({ song }: { song: SongDetail }) {
  const minutes =
    song.durationSeconds === null
      ? null
      : `${Math.floor(song.durationSeconds / 60)}:${String(song.durationSeconds % 60).padStart(2, "0")}`;
  return (
    <dl className="flex flex-col gap-4">
      {song.artist ? <Fact label="Artist">{song.artist}</Fact> : null}
      {minutes ? <Fact label="Duration">{minutes}</Fact> : null}
      {song.notes ? (
        <Fact label="Notes">
          <span className="whitespace-pre-wrap">{song.notes}</span>
        </Fact>
      ) : null}
      {song.references.length > 0 ? (
        <Fact label="Reference">
          <ul className="flex flex-col gap-1">
            {song.references.map((r) => (
              <li key={r.id}>
                {r.label}: {r.value}
              </li>
            ))}
          </ul>
        </Fact>
      ) : null}
    </dl>
  );
}

export function SongLinkView({ songId }: { songId: string }) {
  const router = useRouter();
  const link = useSongLink(songId);
  useAdoptBand(link.data?.bandId);
  const song = useSong(link.data?.bandId, songId);

  if (link.isError) return <NoAccess error={link.error} tab="library" />;
  return (
    <>
      <LibraryTab />
      {song.data ? (
        <RightSheet
          open
          onOpenChange={(o) => !o && router.replace("/library")}
          title={song.data.title}
          subtitle={song.data.artist ?? undefined}
          headerActions={
            <ShareButton path={`/songs/${songId}`} title={song.data.title} />
          }
        >
          <SongBody song={song.data} />
        </RightSheet>
      ) : song.isError ? (
        <NoAccess error={song.error} tab="library" />
      ) : (
        <Pending />
      )}
    </>
  );
}
