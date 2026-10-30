"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Mail,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  PUBLIC_SOCIAL_KEYS,
  type PublicCalendar,
  type PublicCalendarGig,
} from "@greenroom/shared";
import { BandAvatar } from "@/components/app/band-switcher";
import { Brand } from "@/components/onboarding/auth-layout";
import { dayLabel, time12 } from "@/components/events/time";
import { isApiError } from "@/lib/api";
import { fetchPublicCalendar } from "@/lib/queries/public-calendar";
import { cn } from "@/lib/utils";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  website: "Website",
};

/** Only http(s) links are rendered as anchors. */
const safeHref = (v: string): string | null => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/** Anonymous, read-only page; it only ever sees the public calendar payload. */
export function PublicCalendarView() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ["public-calendar", token],
    queryFn: () => fetchPublicCalendar(token),
    retry: (n, e) => !isApiError(e, 404) && n < 2,
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-background px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-xl flex-col gap-6">
        {q.isPending ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : q.isError ? (
          <div
            data-testid="public-calendar-unavailable"
            className="flex flex-col items-center gap-3 rounded-3xl border bg-card p-6 text-center shadow-soft"
          >
            <Brand className="justify-center" />
            <h1 className="text-lg font-semibold">
              {isApiError(q.error, 404)
                ? "We can't find this calendar"
                : "Something went wrong"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isApiError(q.error, 404)
                ? "The link may have been reset. Ask the band for the new one."
                : "We could not load this page. Please try again in a moment."}
            </p>
          </div>
        ) : (
          <Loaded data={q.data} />
        )}
      </div>
    </main>
  );
}

function Header({ data }: { data: PublicCalendar }) {
  const socials = PUBLIC_SOCIAL_KEYS.flatMap((k) => {
    const href = data.socialLinks[k] ? safeHref(data.socialLinks[k]!) : null;
    return href ? [{ key: k, href }] : [];
  });
  return (
    <header
      data-testid="public-calendar-header"
      className="flex flex-col items-center gap-3 text-center"
    >
      <BandAvatar
        band={{
          id: data.bandName,
          name: data.bandName,
          imageUrl: data.photoUrl,
        }}
        className="size-20 rounded-3xl text-xl after:rounded-3xl"
      />
      <h1 className="text-2xl font-semibold tracking-tight">{data.bandName}</h1>
      {data.bio ? (
        <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
          {data.bio}
        </p>
      ) : null}
      {socials.length || data.bookingEmail ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {socials.map((s) => (
            <li key={s.key}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium hover:bg-muted"
              >
                {SOCIAL_LABELS[s.key]}
              </a>
            </li>
          ))}
          {data.bookingEmail ? (
            <li>
              <a
                href={`mailto:${data.bookingEmail}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-muted"
              >
                <Mail className="size-4" /> Book us
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </header>
  );
}

function Loaded({ data }: { data: PublicCalendar }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  return (
    <>
      <Header data={data} />
      <section className="flex flex-col gap-4" aria-label="Upcoming shows">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Upcoming shows</h2>
          <div
            role="group"
            aria-label="View"
            className="inline-flex rounded-full border p-0.5"
          >
            {(
              [
                ["list", "List", List],
                ["calendar", "Calendar", CalendarDays],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
                  view === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
        {view === "list" ? (
          <ShowList gigs={data.gigs} />
        ) : (
          <ShowMonth gigs={data.gigs} />
        )}
      </section>
    </>
  );
}

function When({ gig }: { gig: PublicCalendarGig }) {
  return gig.startTime ? time12(gig.startTime) : "Time to be announced";
}

function ShowList({ gigs }: { gigs: PublicCalendarGig[] }) {
  if (!gigs.length) {
    return (
      <p
        data-testid="public-calendar-empty"
        className="rounded-3xl border bg-card p-6 text-center text-sm text-muted-foreground"
      >
        No upcoming shows yet. Check back soon.
      </p>
    );
  }
  return (
    <ul data-testid="public-calendar-list" className="flex flex-col gap-2">
      {gigs.map((g, i) => (
        <li
          key={`${g.date}-${i}`}
          data-testid="public-gig"
          className="flex flex-col gap-0.5 rounded-2xl border bg-card p-4 shadow-soft"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {dayLabel(g.date)}
          </span>
          <span className="font-semibold">{g.title}</span>
          <span className="text-sm text-muted-foreground">
            <When gig={g} />
            {g.venueName ? ` at ${g.venueName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function ShowMonth({ gigs }: { gigs: PublicCalendarGig[] }) {
  const first = gigs[0]?.date ?? new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState(() => ({
    y: Number(first.slice(0, 4)),
    m: Number(first.slice(5, 7)) - 1,
  }));
  const byDate = useMemo(() => {
    const map = new Map<string, PublicCalendarGig[]>();
    for (const g of gigs) map.set(g.date, [...(map.get(g.date) ?? []), g]);
    return map;
  }, [gigs]);
  const lead = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.y, cursor.m, 1)));
  const shift = (d: number) =>
    setCursor((c) => {
      const t = new Date(Date.UTC(c.y, c.m + d, 1));
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
    });
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const monthGigs = gigs.filter((g) =>
    g.date.startsWith(`${cursor.y}-${pad(cursor.m + 1)}-`),
  );

  return (
    <div data-testid="public-calendar-month" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="inline-flex size-9 items-center justify-center rounded-full border"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-medium" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="inline-flex size-9 items-center justify-center rounded-full border"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          const date = day
            ? `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`
            : "";
          const has = date ? byDate.has(date) : false;
          return (
            <span
              key={i}
              data-has-show={has || undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl text-sm",
                has
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-foreground",
              )}
            >
              {day}
            </span>
          );
        })}
      </div>
      {monthGigs.length ? (
        <ul className="flex flex-col gap-2">
          {monthGigs.map((g, i) => (
            <li
              key={`${g.date}-${i}`}
              data-testid="public-gig"
              className="flex flex-col gap-0.5 rounded-2xl border bg-card p-3"
            >
              <span className="text-xs text-muted-foreground">
                {dayLabel(g.date)}
              </span>
              <span className="font-semibold">{g.title}</span>
              <span className="text-sm text-muted-foreground">
                <When gig={g} />
                {g.venueName ? ` at ${g.venueName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          No shows this month.
        </p>
      )}
    </div>
  );
}
