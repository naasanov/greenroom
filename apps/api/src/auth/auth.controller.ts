import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  updateProfileSchema,
  type AuthResult,
  type MagicLinkRequest,
  type MagicLinkVerify,
  type UpdateProfile,
  type User,
} from "@greenroom/shared";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  GOOGLE_OAUTH,
  type GoogleOAuthAdapter,
} from "../integrations/index.js";
import {
  GOOGLE_STATE_COOKIE,
  apiPublicUrl,
  sessionCookieName,
  webUrl,
} from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser, Public } from "./decorators.js";
import { safeRedirect } from "./redirect.js";
import { SessionService, cookieOptions } from "./session.service.js";

const STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthAdapter,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("magic-link")
  @HttpCode(204)
  async requestMagicLink(
    @Body(new ZodPipe(magicLinkRequestSchema)) body: MagicLinkRequest,
  ): Promise<void> {
    await this.auth.sendMagicLink(body.email, body.redirectTo);
  }

  @Public()
  @Post("magic-link/verify")
  @HttpCode(200)
  async verifyMagicLink(
    @Body(new ZodPipe(magicLinkVerifySchema)) body: MagicLinkVerify,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.verifyMagicLink(body.token);
    if (!result) throw new UnauthorizedException("Invalid or expired link");
    this.sessions.setCookie(res, await this.sessions.create(result.user.id));
    return result;
  }

  @Public()
  @Get("google/start")
  googleStart(
    @Query("redirectTo") redirectTo: unknown,
    @Res() res: Response,
  ): void {
    const nonce = this.auth.newNonce();
    const state = Buffer.from(
      JSON.stringify({ nonce, redirectTo: safeRedirect(redirectTo) }),
    ).toString("base64url");
    res.cookie(GOOGLE_STATE_COOKIE, nonce, cookieOptions(STATE_COOKIE_TTL_MS));
    res.redirect(
      this.google.buildAuthUrl({
        redirectUri: `${apiPublicUrl()}/auth/google/callback`,
        state,
      }),
    );
  }

  @Public()
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: unknown,
    @Query("state") state: unknown,
    @Query("error") oauthError: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const fail = (reason: string): void =>
      res.redirect(`${webUrl()}/sign-in?error=${reason}`);
    const { maxAge: _maxAge, ...clearOpts } = cookieOptions(0);
    void _maxAge;
    const cookieNonce = (req.cookies as Record<string, string> | undefined)?.[
      GOOGLE_STATE_COOKIE
    ];
    res.clearCookie(GOOGLE_STATE_COOKIE, clearOpts);

    if (typeof oauthError === "string") return fail("google_denied");
    if (typeof code !== "string" || typeof state !== "string" || !cookieNonce)
      return fail("invalid_state");
    let parsed: { nonce?: unknown; redirectTo?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    } catch {
      return fail("invalid_state");
    }
    if (parsed.nonce !== cookieNonce) return fail("invalid_state");

    const exchanged = await this.google.exchangeCode({
      code,
      redirectUri: `${apiPublicUrl()}/auth/google/callback`,
    });
    if (exchanged.status !== "ok") return fail("invalid_code");
    const found = await this.auth.findOrCreateByGoogle(exchanged.profile);
    if (!found) return fail("account_conflict");

    this.sessions.setCookie(res, await this.sessions.create(found.user.id));
    res.redirect(`${webUrl()}${safeRedirect(parsed.redirectTo)}`);
  }

  @Get("me")
  me(@CurrentUser() user: User): User {
    return user;
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: User,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfile,
  ): Promise<User> {
    return this.auth.updateProfile(user.id, body);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      sessionCookieName()
    ];
    if (token) await this.sessions.destroy(token);
    this.sessions.clearCookie(res);
  }
}
