import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Query,
  Res,
  ConflictException,
} from "@nestjs/common";
import type { Response } from "express";
import {
  googleServiceSchema,
  type GoogleIntegrations,
  type GooglePickerConfig,
  type GoogleService,
  type User,
} from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { CurrentUser, Public } from "../auth/decorators.js";
import { safeRedirect } from "../auth/redirect.js";
import { BandAdmin, BandMember } from "../bands/band-access.js";
import { GoogleLinksService } from "./google-links.service.js";
import type { LinkCompleteResult } from "./google-links.service.js";

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

function parseService(value: string): GoogleService {
  const parsed = googleServiceSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundException("Unknown Google service");
  return parsed.data;
}

function returnUrl(out: LinkCompleteResult): string {
  const url = new URL(`${webUrl()}${out.redirectTo ?? "/"}`);
  if (out.ok) {
    url.searchParams.set("google", "connected");
  } else {
    url.searchParams.set("google", "error");
    url.searchParams.set("reason", out.reason);
  }
  if (out.service) url.searchParams.set("service", out.service);
  return url.toString();
}

@Controller()
export class GoogleConnectController {
  constructor(private readonly links: GoogleLinksService) {}

  @BandMember()
  @Get("bands/:bandId/integrations/google")
  status(@Param("bandId") bandId: string): Promise<GoogleIntegrations> {
    return this.links.status(bandId);
  }

  @BandMember()
  @Get("bands/:bandId/integrations/google/drive/picker-config")
  async pickerConfig(
    @Param("bandId") bandId: string,
  ): Promise<GooglePickerConfig> {
    const accessToken = await this.links.getAccessToken(bandId, "drive");
    if (!accessToken)
      throw new ConflictException({
        code: "GOOGLE_NOT_LINKED",
        message: "Google Drive is not linked",
      });
    return {
      accessToken,
      developerKey: process.env.GOOGLE_PICKER_API_KEY || null,
      appId: process.env.GOOGLE_PROJECT_NUMBER || null,
      fake: process.env.INTEGRATIONS_MODE === "fake",
    };
  }

  @BandMember()
  @Get("bands/:bandId/integrations/google/:service/start")
  async start(
    @CurrentUser() user: User,
    @Param("bandId") bandId: string,
    @Param("service") service: string,
    @Query("redirectTo") redirectTo: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.links.start(
      user.id,
      bandId,
      parseService(service),
      safeRedirect(redirectTo),
    );
    res.redirect(302, url);
  }

  // Authorized by the single-use state, since the host may differ from the session cookie's.
  @Public()
  @Get("integrations/google/callback")
  async callback(
    @Query("code") code: unknown,
    @Query("state") state: unknown,
    @Query("error") error: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const out = await this.links.complete(
      error ? null : str(code),
      str(state),
      !!error,
    );
    res.redirect(302, returnUrl(out));
  }

  @BandAdmin()
  @Delete("bands/:bandId/integrations/google/:service")
  @HttpCode(204)
  async disconnect(
    @Param("bandId") bandId: string,
    @Param("service") service: string,
  ): Promise<void> {
    await this.links.disconnect(bandId, parseService(service));
  }
}
