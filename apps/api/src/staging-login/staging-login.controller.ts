import { createHash, timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { apiPublicUrl } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import { Public } from "../auth/decorators.js";
import { DemoBandService } from "./demo-band.service.js";
import { renderLoginPage } from "./staging-login.page.js";

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const STATE_PATTERN = /^[A-Za-z0-9_-]{1,2048}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();
const callbackUrl = (): string => `${apiPublicUrl()}/auth/google/callback`;

@Controller("fake-google")
export class StagingLoginController {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly auth: AuthService,
    private readonly demo: DemoBandService,
  ) {}

  @Public()
  @Get("authorize")
  page(
    @Query("redirect_uri") redirectUri: unknown,
    @Query("state") state: unknown,
    @Res() res: Response,
  ): void {
    const p = this.params(redirectUri, state);
    res.type("html").send(renderLoginPage(p));
  }

  @Public()
  @Post("authorize")
  async submit(
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { redirect_uri, state, email, passcode, demo } = body ?? {};
    const p = this.params(redirect_uri, state);
    const ip = String(req.ip);
    if (this.recentFailures(ip).length >= MAX_FAILURES)
      throw new HttpException(
        "Too many attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const normalized =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const wantsDemo = demo === "1";
    const page = (error: string): void => {
      res
        .status(401)
        .type("html")
        .send(
          renderLoginPage({
            ...p,
            email: normalized,
            demo: wantsDemo,
            error,
          }),
        );
    };
    const expected = process.env.STAGING_LOGIN_PASSCODE ?? "";
    const ok =
      typeof passcode === "string" &&
      expected !== "" &&
      timingSafeEqual(digest(passcode), digest(expected));
    if (!ok) {
      this.failures.set(ip, [...this.recentFailures(ip), Date.now()]);
      return page("Wrong passcode.");
    }
    if (!EMAIL_PATTERN.test(normalized)) return page("Enter a valid email.");

    if (wantsDemo) {
      // Same profile shape the fake Google adapter derives from the code.
      const local = normalized.split("@")[0] ?? normalized;
      const found = await this.auth.findOrCreateByGoogle({
        sub: `fake-sub-${local}`,
        email: normalized,
        name: local,
        picture: null,
      });
      if (found) await this.demo.ensureDemoBand(found.user.id);
    }
    const params = new URLSearchParams({
      code: `fake-code:${normalized}`,
      state: p.state,
    });
    res.redirect(303, `${p.redirectUri}?${params}`);
  }

  private params(
    redirectUri: unknown,
    state: unknown,
  ): { redirectUri: string; state: string } {
    if (
      redirectUri !== callbackUrl() ||
      typeof state !== "string" ||
      !STATE_PATTERN.test(state)
    )
      throw new HttpException("Invalid request", HttpStatus.BAD_REQUEST);
    return { redirectUri, state };
  }

  private recentFailures(ip: string): number[] {
    const recent = (this.failures.get(ip) ?? []).filter(
      (t) => Date.now() - t < WINDOW_MS,
    );
    if (recent.length) this.failures.set(ip, recent);
    else this.failures.delete(ip);
    return recent;
  }
}
