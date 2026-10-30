import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { magicLinkTokens, users, type Database } from "@greenroom/db";
import type { User } from "@greenroom/shared";
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { DRIZZLE } from "../db/db.constants.js";
import { EMAIL, type EmailAdapter } from "../integrations/index.js";
import { MAGIC_LINK_TTL_MS, webUrl } from "./auth.constants.js";
import { safeRedirect } from "./redirect.js";
import { hashToken, newToken, toUser } from "./session.service.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL) private readonly email: EmailAdapter,
    private readonly calendarSync: CalendarSyncQueue,
  ) {}

  async sendMagicLink(email: string, redirectTo?: string): Promise<void> {
    const token = newToken();
    await this.db.insert(magicLinkTokens).values({
      email,
      tokenHash: hashToken(token),
      redirectTo: safeRedirect(redirectTo),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });
    const link = `${webUrl()}/auth/callback?token=${encodeURIComponent(token)}`;
    await this.email.sendMagicLink({ to: email, link });
  }

  /** Consumes a magic link token. Returns null when it is invalid, used, or expired. */
  async verifyMagicLink(
    token: string,
  ): Promise<{ user: User; isNewUser: boolean; redirectTo: string } | null> {
    const [row] = await this.db
      .update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(magicLinkTokens.tokenHash, hashToken(token)),
          isNull(magicLinkTokens.usedAt),
          gt(magicLinkTokens.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) return null;
    const { user, isNewUser } = await this.findOrCreateByEmail(row.email);
    return { user, isNewUser, redirectTo: safeRedirect(row.redirectTo) };
  }

  async findOrCreateByEmail(
    email: string,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existing)
      return { user: await toUser(this.db, existing), isNewUser: false };
    const [created] = await this.db
      .insert(users)
      .values({ email, displayName: email.split("@")[0] || email })
      .onConflictDoNothing()
      .returning();
    if (created)
      return { user: await toUser(this.db, created), isNewUser: true };
    const [raced] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return { user: await toUser(this.db, raced!), isNewUser: false };
  }

  /** Finds by google_sub, else links by verified email, else creates. */
  async findOrCreateByGoogle(profile: {
    sub: string;
    email: string;
    name: string;
    picture: string | null;
  }): Promise<{ user: User; isNewUser: boolean } | null> {
    const email = profile.email.toLowerCase();
    const [bySub] = await this.db
      .select()
      .from(users)
      .where(eq(users.googleSub, profile.sub));
    if (bySub) return { user: await toUser(this.db, bySub), isNewUser: false };

    const [byEmail] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (byEmail) {
      if (byEmail.googleSub) return null;
      const [linked] = await this.db
        .update(users)
        .set({
          googleSub: profile.sub,
          avatarUrl: byEmail.avatarUrl ?? profile.picture,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return { user: await toUser(this.db, linked!), isNewUser: false };
    }
    const [created] = await this.db
      .insert(users)
      .values({
        email,
        displayName: profile.name || email.split("@")[0] || email,
        avatarUrl: profile.picture,
        googleSub: profile.sub,
      })
      .returning();
    return { user: await toUser(this.db, created!), isNewUser: true };
  }

  async updateProfile(
    userId: string,
    patch: {
      displayName?: string;
      avatarUrl?: string | null;
      calendarEmail?: string | null;
    },
  ): Promise<User> {
    const set: Partial<typeof users.$inferInsert> = {};
    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
    if (patch.calendarEmail !== undefined)
      set.calendarEmail = patch.calendarEmail;
    if (Object.keys(set).length === 0) {
      const [u] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      return await toUser(this.db, u!);
    }
    const [updated] = await this.db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning();
    if (patch.calendarEmail !== undefined) {
      await this.calendarSync.userAcl(userId);
    }
    return await toUser(this.db, updated!);
  }

  /** Address the band calendar is shared with: the calendar email, else sign-in email. */
  inviteEmailFor(user: Pick<User, "email" | "calendarEmail">): string {
    return user.calendarEmail ?? user.email;
  }

  newNonce(): string {
    return randomBytes(16).toString("base64url");
  }
}
