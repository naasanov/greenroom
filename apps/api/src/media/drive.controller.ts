import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import {
  setDriveFolderSchema,
  type DriveStatus,
  type FakePicker,
  type SetDriveFolder,
} from "@greenroom/shared";
import { BandMember } from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { GoogleLinksService } from "../google-connect/index.js";
import { FakeIntegrationsRegistry } from "../integrations/index.js";
import {
  DriveStructureService,
  NOT_LINKED,
} from "./drive-structure.service.js";
import { ConflictException } from "@nestjs/common";

@BandMember()
@Controller("bands/:bandId/integrations/google/drive")
export class DriveController {
  constructor(
    private readonly structure: DriveStructureService,
    private readonly links: GoogleLinksService,
    private readonly registry: FakeIntegrationsRegistry,
  ) {}

  @Get("status")
  status(@Param("bandId") bandId: string): Promise<DriveStatus> {
    return this.structure.status(bandId);
  }

  @Post("folder")
  @HttpCode(200)
  setFolder(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(setDriveFolderSchema)) body: SetDriveFolder,
  ): Promise<DriveStatus> {
    return this.structure.setRootFolder(bandId, body.folderId);
  }

  // Stand-in for the Google Picker when integrations are faked (staging, e2e).
  @Get("fake-picker")
  async fakePicker(@Param("bandId") bandId: string): Promise<FakePicker> {
    if (process.env.INTEGRATIONS_MODE !== "fake") throw new NotFoundException();
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) throw new ConflictException(NOT_LINKED);
    const fake = this.registry.googleDrive;
    if (fake.allFiles().length <= 1) {
      fake.seedFolder("Band stuff");
      fake.seedFolder("Greenroom demo");
    }
    const children = await fake.listChildren(token, "root");
    return {
      folders: children
        .filter((c) => c.mimeType === "application/vnd.google-apps.folder")
        .map((c) => ({ id: c.id, name: c.name })),
    };
  }
}
