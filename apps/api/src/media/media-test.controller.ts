import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators.js";
import {
  FakeIntegrationsRegistry,
  type DriveFile,
} from "../integrations/index.js";
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

  /** Runs one poller pass synchronously for all linked bands. */
  @Post("poll")
  @HttpCode(200)
  poll(): Promise<PollResult[]> {
    return this.poller.pollAll(true);
  }
}
