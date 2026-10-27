import { Controller, Delete, Get, HttpCode, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { User } from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { CurrentUser, Public } from "../auth/decorators.js";
import { safeRedirect } from "../auth/redirect.js";
import { SpotifyConnectionsService } from "./spotify-connections.service.js";

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

function returnUrl(redirectTo: string, result: "connected" | "error"): string {
  const url = new URL(`${webUrl()}${redirectTo}`);
  url.searchParams.set("spotify", result);
  return url.toString();
}

@Controller("integrations/spotify")
export class SpotifyConnectController {
  constructor(private readonly connections: SpotifyConnectionsService) {}

  @Get()
  status(
    @CurrentUser() user: User,
  ): Promise<{ connected: boolean; displayName: string | null }> {
    return this.connections.status(user.id);
  }

  @Get("start")
  async start(
    @CurrentUser() user: User,
    @Query("redirectTo") redirectTo: unknown,
    @Query("scopes") scopes: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.connections.start(
      user.id,
      safeRedirect(redirectTo),
      scopes === "export" ? "export" : "import",
    );
    res.redirect(302, url);
  }

  // Authorized by the single-use state, since the host may differ from the session cookie's.
  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: unknown,
    @Query("state") state: unknown,
    @Query("error") error: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const out = await this.connections.complete(
      error ? null : str(code),
      str(state),
    );
    res.redirect(
      302,
      returnUrl(out.redirectTo ?? "/", out.ok ? "connected" : "error"),
    );
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentUser() user: User): Promise<void> {
    await this.connections.disconnect(user.id);
  }
}
