import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { LinkPreviewService } from "./link-preview.service.js";

/** Anonymous title-only lookups for link-preview metadata; the uuid is the credential. */
@Public()
@Controller("public/link-preview")
export class LinkPreviewController {
  constructor(private readonly previews: LinkPreviewService) {}

  @Get("songs/:id")
  song(@Param("id") id: string) {
    return this.previews.song(id);
  }

  @Get("gigs/:id")
  gig(@Param("id") id: string) {
    return this.previews.gig(id);
  }
}
