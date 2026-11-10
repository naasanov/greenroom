import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gte, isNull } from "drizzle-orm";
import {
  bands,
  calendarInvites,
  gigs,
  memberships,
  practiceOccurrenceOverrides,
  practiceRsvps,
  practiceSeries,
  users,
  type Database,
} from "@greenroom/db";
import { gigSlugId } from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { gigInput } from "./gig-event.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  buildCalendar,
  type IcsEvent,
  type IcsMethod,
  type IcsPartstat,
  type InviteMethod,
} from "./ics.js";
import { buildOccurrence, isRecurring } from "../events/occurrences.js";
import type { OverrideRow, SeriesRow } from "../events/occurrences.js";
import { occurrencesBetween } from "../events/recurrence.js";
import { addDays, localDate } from "../events/time.js";
import { EMAIL, type EmailAdapter } from "../integrations/index.js";
import {
  CalendarInviteQueue,
  inviteJobKey,
  type InviteJob,
} from "./calendar-invite.queue.js";
import { replyAddress, replyDomain, type InviteKind } from "./reply-token.js";
import { rsvpLinkUrls, type RsvpLinks } from "./rsvp-link.js";

type GigRow = typeof gigs.$inferSelect;
type InviteRow = typeof calendarInvites.$inferSelect;

const DAY_MS = 86_400_000;
/** Series count as upcoming when the rule yields an occurrence within this window. */
const HORIZON_DAYS = 800;
const EPOCH = new Date(0);

const RSVP_PARTSTAT: Record<string, IcsPartstat> = {
  going: "ACCEPTED",
  maybe: "TENTATIVE",
  not_going: "DECLINED",
  no_response: "NEEDS-ACTION",
};

interface BandCtx {
  bandId: string;
  bandName: string;
  members: Recipient[];
}

interface Recipient {
  userId: string | null;
  email: string;
  key: string;
  name: string;
  enabled: boolean;
}

/** What one event looks like to the sender: content per recipient plus message copy. */
interface EventPlan {
  kind: InviteKind;
  id: string;
  bandId: string;
  uid: string;
  title: string;
  when: string;
  where: string | null;
  link: string;
  /** True when the event is gone and every recipient gets a CANCEL. */
  cancelled: boolean;
  events(r: Recipient, sequence: number, method: IcsMethod): IcsEvent[];
  /** One-click RSVP links for this recipient (practices only). */
  rsvpLinks?(r: Recipient): RsvpLinks | null;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const uidOf = (kind: InviteKind, id: string): string =>
  `${kind}-${id}@${replyDomain()}`;

function whenLabel(
  start: Date,
  tz: string,
  allDay: boolean,
  dateOnly?: string,
): string {
  if (allDay && dateOnly) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      dateStyle: "medium",
    }).format(new Date(`${dateOnly}T00:00:00Z`));
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(start);
}

/**
 * Sends iCalendar invites (iMIP) for gigs and practice series. Every run is a
 * reconcile: it compares what each recipient should hold with the bookkeeping rows
 * and sends only REQUESTs for new or changed content and CANCELs for removed ones.
 */
@Injectable()
export class CalendarInviteService {
  private readonly log = new Logger(CalendarInviteService.name);
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL) private readonly email: EmailAdapter,
    private readonly queue: CalendarInviteQueue,
  ) {}

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  // ---- entry points ----

  /** Runs one delivered queue job unless a drain already handled it. */
  runJob(job: InviteJob): Promise<void> {
    return this.locked(async () => {
      if (!this.queue.shouldRun(job)) return;
      await this.process(job);
    });
  }

  /** Applies every pending reconcile, for one band or all. Throws the first failure after trying all. */
  flush(bandId?: string): Promise<void> {
    return this.locked(async () => {
      let failure: unknown;
      for (const job of this.queue.entries(bandId)) {
        if (!this.queue.has(inviteJobKey(job))) continue;
        try {
          await this.process(job);
        } catch (err) {
          failure ??= err;
          this.log.warn(
            `calendar invite ${job.kind} ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (failure) throw failure;
    });
  }

  /** Turns invites on or off for a user; turning them on catches up on upcoming events. */
  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.db
      .update(users)
      .set({ calendarInvitesEnabled: enabled })
      .where(eq(users.id, userId));
    await this.queue.user(userId);
  }

  /**
   * Runs an RSVP change that came from the member's own calendar. When the member's
   * invite was current before the change, its stored hash moves to the new state without
   * an email (their calendar already shows the answer); otherwise a normal reconcile runs.
   */
  withSilentReply(
    bandId: string,
    seriesId: string,
    userId: string,
    change: () => Promise<void>,
  ): Promise<void> {
    return this.locked(async () => {
      const before = await this.memberHash(bandId, seriesId, userId);
      await change();
      const after = await this.memberHash(bandId, seriesId, userId);
      if (!before || !after || before.hash === after.hash) return;
      if (before.row.lastPayloadHash !== before.hash) return;
      await this.db
        .update(calendarInvites)
        .set({ lastPayloadHash: after.hash })
        .where(eq(calendarInvites.id, before.row.id));
      this.queue.done({ bandId, kind: "series", id: seriesId });
    });
  }

  private async memberHash(
    bandId: string,
    seriesId: string,
    userId: string,
  ): Promise<{ row: InviteRow; hash: string } | null> {
    const [s] = await this.db
      .select()
      .from(practiceSeries)
      .where(eq(practiceSeries.id, seriesId));
    const ctx = await this.bandContext(bandId);
    const r = ctx?.members.find((m) => m.userId === userId && m.enabled);
    if (!s || !ctx || !r) return null;
    const plan = await this.seriesPlan(s, ctx);
    if (!plan || plan.cancelled) return null;
    const [row] = await this.db
      .select()
      .from(calendarInvites)
      .where(
        and(
          eq(calendarInvites.kind, "series"),
          eq(calendarInvites.eventId, seriesId),
          eq(calendarInvites.email, r.key),
        ),
      );
    if (!row || row.cancelledAt) return null;
    return { row, hash: this.fingerprint(plan, r) };
  }

  /** Upcoming gigs and practices of a band as one METHOD:PUBLISH calendar for a member. */
  async feed(bandId: string, userId: string): Promise<string | null> {
    const ctx = await this.bandContext(bandId);
    const r = ctx?.members.find((m) => m.userId === userId);
    if (!ctx || !r) return null;
    const today = addDays(new Date().toISOString().slice(0, 10), -1);
    const gigRows = await this.db
      .select()
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, bandId),
          gte(gigs.date, today),
          isNull(gigs.deletedAt),
        ),
      )
      .orderBy(gigs.date, gigs.id);
    const seriesRows = await this.db
      .select()
      .from(practiceSeries)
      .where(
        and(
          eq(practiceSeries.bandId, bandId),
          isNull(practiceSeries.deletedAt),
        ),
      )
      .orderBy(practiceSeries.id);
    const events: IcsEvent[] = [];
    const plans: EventPlan[] = [];
    for (const g of gigRows) {
      const p = this.gigPlan(g, ctx);
      if (p) plans.push(p);
    }
    for (const s of seriesRows) {
      const p = await this.seriesPlan(s, ctx);
      if (p) plans.push(p);
    }
    for (const p of plans) {
      if (!p.cancelled) events.push(...p.events(r, 0, "PUBLISH"));
    }
    return buildCalendar({
      method: "PUBLISH",
      // Hour-stable so unchanged feeds keep one ETag.
      dtstamp: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000),
      events,
      name: `${ctx.bandName} (Greenroom)`,
    });
  }

  private async process(job: InviteJob): Promise<void> {
    // Marked done first: a failure is retried by pg-boss, and edits made meanwhile re-add the job.
    this.queue.done(job);
    this.log.log(`calendar invite ${job.kind} job ${job.id} started`);
    try {
      if (job.kind === "gig") await this.reconcileGig(job.bandId, job.id);
      else if (job.kind === "series") {
        await this.reconcileSeries(job.bandId, job.id);
      } else await this.reconcileBand(job.bandId);
    } catch (err) {
      this.queue.requeue(job);
      throw err;
    }
  }

  // ---- reconcile ----

  private async reconcileBand(bandId: string): Promise<void> {
    const ctx = await this.bandContext(bandId);
    if (!ctx) return;
    const today = addDays(new Date().toISOString().slice(0, 10), -1);
    const gigRows = await this.db
      .select()
      .from(gigs)
      .where(and(eq(gigs.bandId, bandId), gte(gigs.date, today)));
    const seriesRows = await this.db
      .select()
      .from(practiceSeries)
      .where(eq(practiceSeries.bandId, bandId));
    let failure: unknown;
    for (const g of gigRows) {
      try {
        await this.applyGig(g, ctx);
      } catch (err) {
        failure ??= err;
      }
    }
    for (const s of seriesRows) {
      try {
        await this.applySeries(s, ctx);
      } catch (err) {
        failure ??= err;
      }
    }
    if (failure) throw failure;
  }

  private async reconcileGig(bandId: string, gigId: string): Promise<void> {
    const [g] = await this.db.select().from(gigs).where(eq(gigs.id, gigId));
    if (!g) return;
    const ctx = await this.bandContext(bandId);
    if (ctx) await this.applyGig(g, ctx);
  }

  private async reconcileSeries(
    bandId: string,
    seriesId: string,
  ): Promise<void> {
    const [s] = await this.db
      .select()
      .from(practiceSeries)
      .where(eq(practiceSeries.id, seriesId));
    if (!s) return;
    const ctx = await this.bandContext(bandId);
    if (ctx) await this.applySeries(s, ctx);
  }

  private async bandContext(bandId: string): Promise<BandCtx | null> {
    const [band] = await this.db
      .select({ name: bands.name })
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band) return null;
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        calendarEmail: users.calendarEmail,
        name: users.displayName,
        enabled: users.calendarInvitesEnabled,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.bandId, bandId),
          isNull(memberships.leftAt),
          eq(users.isPlaceholder, false),
        ),
      )
      .orderBy(memberships.joinedAt, users.id);
    const seen = new Set<string>();
    const members: Recipient[] = [];
    for (const r of rows) {
      const email = r.calendarEmail || r.email;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        userId: r.userId,
        email,
        key,
        name: r.name,
        enabled: r.enabled,
      });
    }
    return { bandId, bandName: band.name, members };
  }

  // ---- plans ----

  private async applyGig(g: GigRow, ctx: BandCtx): Promise<void> {
    const plan = this.gigPlan(g, ctx);
    if (plan) await this.apply(plan, ctx);
  }

  private gigPlan(g: GigRow, ctx: BandCtx): EventPlan | null {
    const today = localDate(new Date(), g.timeZone);
    if (g.date < today) return null;
    const base = gigInput(g, webUrl());
    const allDay = base.allDay ?? false;
    const link = `${webUrl()}/gigs/${gigSlugId(g)}`;
    const start = new Date(
      g.allDay || !g.startsAt ? `${g.date}T00:00:00Z` : base.start,
    );
    const plan: EventPlan = {
      kind: "gig",
      id: g.id,
      bandId: g.bandId,
      uid: uidOf("gig", g.id),
      title: g.title,
      when: whenLabel(start, g.timeZone, allDay, g.date),
      where: base.location ?? null,
      link,
      cancelled: g.deletedAt != null,
      events: (r, sequence) => [
        {
          uid: uidOf("gig", g.id),
          sequence,
          summary: base.summary,
          description: base.description,
          location: base.location,
          url: link,
          allDay,
          start: base.start,
          end: base.end,
          timeZone: base.timeZone ?? g.timeZone,
          organizer: this.organizer("gig", g.id, ctx.bandName),
          attendee: {
            email: r.email,
            name: r.name || undefined,
            partstat: "NEEDS-ACTION",
          },
        },
      ],
    };
    return plan;
  }

  private async applySeries(s: SeriesRow, ctx: BandCtx): Promise<void> {
    const plan = await this.seriesPlan(s, ctx);
    if (plan) await this.apply(plan, ctx);
  }

  private async seriesPlan(
    s: SeriesRow,
    ctx: BandCtx,
  ): Promise<EventPlan | null> {
    const now = new Date();
    const upcoming =
      occurrencesBetween(
        s,
        now,
        new Date(now.getTime() + HORIZON_DAYS * DAY_MS),
      ).length > 0;
    const overrides = await this.db
      .select()
      .from(practiceOccurrenceOverrides)
      .where(eq(practiceOccurrenceOverrides.seriesId, s.id));
    const recurring = isRecurring(s);
    const oneOff = recurring ? undefined : overrides[0];
    // A one-off is upcoming by its (possibly moved) start; a rule is upcoming by its occurrences.
    const oneOffStart = oneOff?.startsAt ?? s.dtstart;
    if (
      recurring ? !upcoming : oneOffStart.getTime() < now.getTime() - DAY_MS
    ) {
      return null;
    }
    const rsvps = await this.db
      .select()
      .from(practiceRsvps)
      .where(eq(practiceRsvps.seriesId, s.id));
    const rsvpOf = (userId: string | null, original: Date): IcsPartstat => {
      const row = rsvps.find(
        (x) =>
          x.userId === userId &&
          x.originalStart.getTime() === original.getTime(),
      );
      return RSVP_PARTSTAT[row?.status ?? "no_response"]!;
    };
    const cancelledAt = new Set(
      overrides
        .filter((o) => o.cancelled)
        .map((o) => o.originalStart.getTime()),
    );
    const overrideAt = new Set(overrides.map((o) => o.originalStart.getTime()));
    const upcomingStarts = recurring
      ? occurrencesBetween(
          s,
          now,
          new Date(now.getTime() + HORIZON_DAYS * DAY_MS),
        ).filter((d) => !cancelledAt.has(d.getTime()))
      : [];
    // The master carries the answer for the next occurrence; other answers become RECURRENCE-ID components.
    const masterPartstat = (userId: string | null): IcsPartstat =>
      upcomingStarts[0] ? rsvpOf(userId, upcomingStarts[0]) : "NEEDS-ACTION";

    const link = `${webUrl()}/practices/${s.id}`;
    const organizer = this.organizer("series", s.id, ctx.bandName);
    const uid = uidOf("series", s.id);
    const component = (
      r: Recipient,
      sequence: number,
      original: Date,
      o: OverrideRow | undefined,
      extra: Partial<IcsEvent>,
    ): IcsEvent => {
      const occ = buildOccurrence(s, original, o);
      return {
        uid,
        sequence,
        summary: occ.title,
        description: link,
        location: occ.location,
        url: link,
        allDay: false,
        start: occ.startsAt,
        end: occ.endsAt,
        timeZone: s.timeZone,
        organizer,
        attendee: {
          email: r.email,
          name: r.name || undefined,
          partstat: rsvpOf(r.userId, original),
        },
        ...extra,
      };
    };

    const cancelledOneOff = !recurring && oneOff?.cancelled === true;
    const first = buildOccurrence(s, s.dtstart, oneOff);
    const plan: EventPlan = {
      kind: "series",
      id: s.id,
      bandId: s.bandId,
      uid,
      title: s.title,
      when: whenLabel(new Date(first.startsAt), s.timeZone, false),
      where: s.location,
      link,
      cancelled: s.deletedAt != null || cancelledOneOff,
      events: (r, sequence, method) => {
        if (!recurring) {
          return [component(r, sequence, s.dtstart, oneOff, {})];
        }
        const master = component(r, sequence, s.dtstart, undefined, {
          summary: s.title,
          location: s.location,
          start: s.dtstart.toISOString(),
          end: new Date(
            s.dtstart.getTime() + s.durationMinutes * 60_000,
          ).toISOString(),
          rrule: s.rrule,
          attendee: {
            email: r.email,
            name: r.name || undefined,
            partstat: masterPartstat(r.userId),
          },
          exdates:
            method === "CANCEL"
              ? undefined
              : overrides
                  .filter((o) => o.cancelled)
                  .map((o) => o.originalStart.toISOString())
                  .sort(),
        });
        if (method === "CANCEL") return [master];
        const moved = overrides
          .filter((o) => !o.cancelled)
          .sort((a, b) => a.originalStart.getTime() - b.originalStart.getTime())
          .map((o) =>
            component(r, sequence, o.originalStart, o, {
              recurrenceId: o.originalStart.toISOString(),
            }),
          );
        const master0 = masterPartstat(r.userId);
        const answered = upcomingStarts
          .filter(
            (d) =>
              !overrideAt.has(d.getTime()) && rsvpOf(r.userId, d) !== master0,
          )
          .map((d) =>
            component(r, sequence, d, undefined, {
              recurrenceId: d.toISOString(),
            }),
          );
        return [master, ...moved, ...answered];
      },
      rsvpLinks: (r) =>
        r.userId
          ? rsvpLinkUrls(
              { userId: r.userId, seriesId: s.id },
              recurring ? undefined : s.dtstart,
            )
          : null,
    };
    return plan;
  }

  private organizer(
    kind: InviteKind,
    id: string,
    bandName: string,
  ): { email: string; name: string } {
    return { email: replyAddress(kind, id), name: `${bandName} via Greenroom` };
  }

  // ---- send ----

  private async apply(
    plan: EventPlan,
    ctx: { bandName: string; members: Recipient[] },
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(calendarInvites)
      .where(
        and(
          eq(calendarInvites.kind, plan.kind),
          eq(calendarInvites.eventId, plan.id),
        ),
      );
    const byKey = new Map(rows.map((r) => [r.email, r]));
    const active = new Map(
      ctx.members.filter((m) => m.enabled).map((m) => [m.key, m]),
    );
    // Opted-out members are left alone entirely: no sends, no cancels.
    const paused = new Set(
      ctx.members.filter((m) => !m.enabled).map((m) => m.key),
    );
    let failure: unknown;
    const attempt = async (fn: () => Promise<void>): Promise<void> => {
      try {
        await fn();
      } catch (err) {
        failure ??= err;
      }
    };

    for (const row of rows) {
      if (row.cancelledAt || paused.has(row.email)) continue;
      if (!plan.cancelled && active.has(row.email)) continue;
      const r: Recipient = active.get(row.email) ?? {
        userId: null,
        email: row.email,
        key: row.email,
        name: "",
        enabled: true,
      };
      await attempt(() => this.send(plan, ctx.bandName, r, row, "CANCEL"));
    }
    if (!plan.cancelled) {
      for (const r of active.values()) {
        const row = byKey.get(r.key);
        const hash = this.fingerprint(plan, r);
        if (row && !row.cancelledAt && row.lastPayloadHash === hash) continue;
        await attempt(() =>
          this.send(plan, ctx.bandName, r, row, "REQUEST", hash),
        );
      }
    }
    if (failure) throw failure;
  }

  private fingerprint(plan: EventPlan, r: Recipient): string {
    const text = buildCalendar({
      method: "REQUEST",
      dtstamp: EPOCH,
      events: plan.events(r, 0, "REQUEST"),
      omitTimezones: true,
    });
    return createHash("sha256").update(text).digest("hex");
  }

  private async send(
    plan: EventPlan,
    bandName: string,
    r: Recipient,
    row: InviteRow | undefined,
    method: InviteMethod,
    hash?: string,
  ): Promise<void> {
    const sequence = row ? row.sequence + 1 : 0;
    const now = new Date();
    const ics = buildCalendar({
      method,
      dtstamp: now,
      events: plan.events(r, sequence, method),
    });
    const verb =
      method === "CANCEL"
        ? "Canceled"
        : row && !row.cancelledAt
          ? "Updated invitation"
          : "Invitation";
    const organizer = replyAddress(plan.kind, plan.id);
    const lead =
      method === "CANCEL"
        ? `${plan.title} has been canceled.`
        : `${bandName} ${row && !row.cancelledAt ? "updated" : "invited you to"} ${plan.title}.`;
    const details = [
      `When: ${plan.when}`,
      ...(plan.where ? [`Where: ${plan.where}`] : []),
    ];
    const links = method === "CANCEL" ? null : (plan.rsvpLinks?.(r) ?? null);
    const footer =
      method === "CANCEL"
        ? ""
        : `${links ? "Or reply" : "Reply"} with Yes, Maybe or No in your calendar app.`;
    const text = [
      lead,
      "",
      ...details,
      "",
      `Open in Greenroom: ${plan.link}`,
      ...(links
        ? [
            "",
            "Can you make it?",
            `Yes: ${links.going}`,
            `Maybe: ${links.maybe}`,
            `No: ${links.no}`,
          ]
        : []),
      ...(footer ? ["", footer] : []),
    ].join("\n");
    const href = (u: string, label: string): string =>
      `<a href="${escapeHtml(u)}">${label}</a>`;
    const html =
      `<p>${escapeHtml(lead)}</p><p>${details.map(escapeHtml).join("<br>")}</p>` +
      `<p><a href="${escapeHtml(plan.link)}">Open in Greenroom</a></p>` +
      (links
        ? `<p>Can you make it? ${href(links.going, "Yes")} | ${href(links.maybe, "Maybe")} | ${href(links.no, "No")}</p>`
        : "") +
      (footer ? `<p>${escapeHtml(footer)}</p>` : "");
    await this.email.sendCalendarInvite({
      to: r.email,
      subject: `${verb}: ${plan.title} @ ${plan.when}`,
      text,
      html,
      ics,
      method,
      from: `"${bandName.replace(/["<>\r\n]/g, "")} via Greenroom" <${organizer}>`,
    });
    this.log.log(`calendar invite ${method} sent for ${plan.kind} ${plan.id}`);
    const values = {
      bandId: plan.bandId,
      kind: plan.kind,
      eventId: plan.id,
      email: r.key,
      uid: plan.uid,
      sequence,
      lastSentAt: now,
      lastPayloadHash:
        method === "CANCEL" ? (row?.lastPayloadHash ?? null) : (hash ?? null),
      cancelledAt: method === "CANCEL" ? now : null,
    };
    await this.db
      .insert(calendarInvites)
      .values(values)
      .onConflictDoUpdate({
        target: [
          calendarInvites.kind,
          calendarInvites.eventId,
          calendarInvites.email,
        ],
        set: values,
      });
  }
}
