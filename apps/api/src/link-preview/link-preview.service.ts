import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { gigs, songs, type Database } from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a record id to its title and nothing else. */
@Injectable()
export class LinkPreviewService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async song(id: string): Promise<{ title: string }> {
    if (!UUID.test(id)) throw new NotFoundException();
    const [row] = await this.db
      .select({ title: songs.title })
      .from(songs)
      .where(and(eq(songs.id, id), isNull(songs.deletedAt)));
    if (!row) throw new NotFoundException();
    return row;
  }

  async gig(id: string): Promise<{ title: string }> {
    if (!UUID.test(id)) throw new NotFoundException();
    const [row] = await this.db
      .select({ title: gigs.title })
      .from(gigs)
      .where(and(eq(gigs.id, id), isNull(gigs.deletedAt)));
    if (!row) throw new NotFoundException();
    return row;
  }
}
