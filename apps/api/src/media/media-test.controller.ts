import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Response } from "express";
import { uploadSessions, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { Public } from "../auth/decorators.js";
import {
  FakeIntegrationsRegistry,
  type DriveFile,
} from "../integrations/index.js";
import { UploadsService } from "./uploads.service.js";
import { DrivePollerService, type PollResult } from "./drive-poller.service.js";

interface ExternalBody {
  action: "add" | "folder" | "rename" | "move" | "trash" | "delete";
  fileId?: string;
  parentId?: string;
  name?: string;
  content?: string;
  mimeType?: string;
}

// Registered only when testingEnabled(); drives the fake Drive from specs.
@Public()
@Controller("__test__/media")
export class MediaTestController {
  constructor(
    private readonly registry: FakeIntegrationsRegistry,
    private readonly poller: DrivePollerService,
    private readonly uploads: UploadsService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  @Get("files")
  files(): DriveFile[] {
    return this.registry.googleDrive.allFiles();
  }

  @Get("files/:fileId/content")
  content(@Param("fileId") fileId: string, @Res() res: Response): void {
    const buf = this.registry.googleDrive.getContent(fileId);
    if (!buf) {
      res.status(404).end();
      return;
    }
    res.send(buf);
  }

  /** Simulates an edit made directly in the Drive UI. */
  @Post("external")
  @HttpCode(200)
  external(@Body() b: ExternalBody): DriveFile | { ok: true } {
    const d = this.registry.googleDrive;
    const need = (v: string | undefined, k: string): string => {
      if (!v) throw new BadRequestException(`${k} is required`);
      return v;
    };
    switch (b.action) {
      case "add":
        return d.externalAddFile(
          need(b.name, "name"),
          need(b.parentId, "parentId"),
          b.content ?? "",
          b.mimeType,
        );
      case "folder":
        return d.seedFolder(need(b.name, "name"), b.parentId ?? "root");
      case "rename":
        d.externalRename(need(b.fileId, "fileId"), need(b.name, "name"));
        return { ok: true };
      case "move":
        d.externalMove(need(b.fileId, "fileId"), need(b.parentId, "parentId"));
        return { ok: true };
      case "trash":
        d.externalTrash(need(b.fileId, "fileId"));
        return { ok: true };
      case "delete":
        d.externalDelete(need(b.fileId, "fileId"));
        return { ok: true };
      default:
        throw new BadRequestException("unknown action");
    }
  }

  /** Makes the next chunk on the session's Drive upload keep `acceptBytes` then fail. */
  @Post("uploads/:sessionId/interrupt")
  @HttpCode(200)
  async interrupt(
    @Param("sessionId") sessionId: string,
    @Body() b: { acceptBytes?: number },
  ): Promise<{ ok: true }> {
    this.registry.googleDrive.interruptUpload(
      await this.driveUrl(sessionId),
      b.acceptBytes ?? 0,
    );
    return { ok: true };
  }

  /** Drops the session's Drive upload as if it expired. */
  @Post("uploads/:sessionId/expire")
  @HttpCode(200)
  async expire(@Param("sessionId") sessionId: string): Promise<{ ok: true }> {
    this.registry.googleDrive.expireSession(await this.driveUrl(sessionId));
    return { ok: true };
  }

  /** Backdates the session's last activity. */
  @Post("uploads/:sessionId/age")
  @HttpCode(200)
  async age(
    @Param("sessionId") sessionId: string,
    @Body() b: { days: number },
  ): Promise<{ ok: true }> {
    const at = new Date(Date.now() - b.days * 86_400_000);
    await this.db.execute(
      sql`update upload_sessions set updated_at = ${at.toISOString()}, created_at = ${at.toISOString()} where id = ${sessionId}`,
    );
    return { ok: true };
  }

  /** Runs the stale-upload cleanup job body once. */
  @Post("uploads/cleanup")
  @HttpCode(200)
  async cleanup(): Promise<{ failed: number }> {
    return { failed: await this.uploads.cleanup() };
  }

  private async driveUrl(sessionId: string): Promise<string> {
    const [row] = await this.db
      .select({ url: uploadSessions.driveSessionUrl })
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId));
    if (!row?.url) throw new BadRequestException("No Drive session");
    return row.url;
  }

  /** Runs one poller pass synchronously for all linked bands. */
  @Post("poll")
  @HttpCode(200)
  poll(): Promise<PollResult[]> {
    return this.poller.pollAll(true);
  }
}
