import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import type { CookieOptions, Response } from "express";
import { sessions, users, type Database } from "@greenroom/db";
import type { User } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { SESSION_TTL_MS, sessionCookieName } from "./auth.constants.js";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");

export function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}

@Injectable()
export class SessionService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Creates a session row and returns the raw token (only its hash is stored). */
  async create(userId: string): Promise<string> {
    const token = newToken();
    await this.db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
  }

  setCookie(res: Response, token: string): void {
    res.cookie(sessionCookieName(), token, cookieOptions(SESSION_TTL_MS));
  }

  clearCookie(res: Response): void {
    const { maxAge: _maxAge, ...opts } = cookieOptions(0);
    void _maxAge;
    res.clearCookie(sessionCookieName(), opts);
  }

  /** Resolves a raw token to its user and slides the expiry forward. */
  async resolve(token: string): Promise<User | null> {
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!row) return null;
    // Refresh at most once a day to avoid a write on every request.
    if (row.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - 86_400_000) {
      await this.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
        .where(eq(sessions.id, row.sessionId));
    }
    return toUser(row.user);
  }

  async destroy(token: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
}

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
  };
}
