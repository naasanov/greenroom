import { Body, Controller, Delete, Get, HttpCode, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  deleteAccountSchema,
  type DeleteAccount,
  type DeletionPreview,
  type User,
} from "@greenroom/shared";
import { CurrentUser } from "../auth/decorators.js";
import { SessionService } from "../auth/session.service.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AccountService } from "./account.service.js";

@Controller("users/me")
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionService,
  ) {}

  @Get("deletion-preview")
  preview(@CurrentUser() user: User): Promise<DeletionPreview> {
    return this.account.preview(user.id);
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    // Validated for the confirmation word; the value itself is not used.
    @Body(new ZodPipe(deleteAccountSchema)) _body: DeleteAccount,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.deleteAccount(user);
    this.sessions.clearCookie(res);
  }
}
