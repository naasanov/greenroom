import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
import {
  gigSetlists,
  gigs,
  setlistItems,
  setlists,
  songs,
  type Database,
} from "@greenroom/db";
import {
  SETLIST_ERROR_CODES,
  type AddSongToSetlist,
  type CopySetlist,
  type GigHistoryEntry,
  type GigHistoryQuery,
  type GigSetlist,
  type SetlistDetail,
  type SongAddedToSetlist,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { SongsService } from "../songs/songs.service.js";
import {
  appendSongs,
  assertBandSongs,
  copyItems,
  lockSetlist,
  readSetlist,
  replaceItems,
} from "./items.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SetlistsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly songsService: SongsService,
  ) {}

  /** The setlist or a 404 when the id is unknown or belongs to another band. */
  async get(bandId: string, setlistId: string): Promise<SetlistDetail> {
    if (!UUID_RE.test(setlistId))
      throw new NotFoundException("Setlist not found");
    const detail = await readSetlist(this.db, bandId, setlistId);
    if (!detail) throw new NotFoundException("Setlist not found");
    return detail;
  }

  /** Runs an edit under a row lock and returns the fresh setlist. */
  private async edit(
    bandId: string,
    setlistId: string,
    fn: (
      tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    ) => Promise<void>,
  ): Promise<SetlistDetail> {
    await this.get(bandId, setlistId);
    return this.db.transaction(async (tx) => {
      await lockSetlist(tx, setlistId);
      await fn(tx);
      return (await readSetlist(tx, bandId, setlistId))!;
    });
  }

  async replace(
    bandId: string,
    setlistId: string,
    songIds: string[],
  ): Promise<SetlistDetail> {
    if (new Set(songIds).size !== songIds.length) {
      throw new BadRequestException({
        code: SETLIST_ERROR_CODES.duplicateSongInSetlist,
        message: "A song can appear in a setlist only once",
      });
    }
    await assertBandSongs(this.db, bandId, songIds);
    return this.edit(bandId, setlistId, (tx) =>
      replaceItems(tx, setlistId, songIds),
    );
  }

  /** Appends a song; a song already in the setlist is left where it is. */
  async append(
    bandId: string,
    setlistId: string,
    songId: string,
  ): Promise<SetlistDetail> {
    await assertBandSongs(this.db, bandId, [songId]);
    return this.edit(bandId, setlistId, (tx) =>
      appendSongs(tx, setlistId, [songId]),
    );
  }

  /** Removes a song; removing one that is not in the setlist changes nothing. */
  async removeSong(
    bandId: string,
    setlistId: string,
    songId: string,
  ): Promise<SetlistDetail> {
    return this.edit(bandId, setlistId, async (tx) => {
      if (!UUID_RE.test(songId)) return;
      await tx
        .delete(setlistItems)
        .where(
          and(
            eq(setlistItems.setlistId, setlistId),
            eq(setlistItems.songId, songId),
          ),
        );
    });
  }

  async copyFrom(
    bandId: string,
    setlistId: string,
    body: CopySetlist,
  ): Promise<SetlistDetail> {
    if (body.sourceSetlistId === setlistId) {
      throw new BadRequestException("Cannot copy a setlist onto itself");
    }
    await this.get(bandId, body.sourceSetlistId);
    return this.edit(bandId, setlistId, (tx) =>
      copyItems(tx, body.sourceSetlistId, setlistId, body.mode),
    );
  }

  /** Creates the song (same rules as the library) and appends it to the setlist. */
  async addNewSong(
    bandId: string,
    setlistId: string,
    body: AddSongToSetlist,
  ): Promise<SongAddedToSetlist> {
    await this.get(bandId, setlistId);
    const song = await this.songsService.create(bandId, body);
    const setlist = await this.edit(bandId, setlistId, (tx) =>
      appendSongs(tx, setlistId, [song.id]),
    );
    return { song, setlist };
  }

  // ---- gigs ----

  /** The gig's setlist, created empty on first access. */
  async forGig(bandId: string, gigId: string): Promise<GigSetlist> {
    if (!UUID_RE.test(gigId)) throw new NotFoundException("Gig not found");
    const [gig] = await this.db
      .select({ id: gigs.id })
      .from(gigs)
      .where(
        and(
          eq(gigs.id, gigId),
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
        ),
      );
    if (!gig) throw new NotFoundException("Gig not found");

    const setlistId = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ setlistId: gigSetlists.setlistId })
        .from(gigSetlists)
        .where(eq(gigSetlists.gigId, gigId));
      if (existing) return existing.setlistId;
      const [sl] = await tx.insert(setlists).values({ bandId }).returning();
      const claimed = await tx
        .insert(gigSetlists)
        .values({ bandId, gigId, setlistId: sl!.id })
        .onConflictDoNothing()
        .returning();
      if (claimed.length > 0) return sl!.id;
      // A concurrent request created it first; drop ours and use theirs.
      await tx.delete(setlists).where(eq(setlists.id, sl!.id));
      const [winner] = await tx
        .select({ setlistId: gigSetlists.setlistId })
        .from(gigSetlists)
        .where(eq(gigSetlists.gigId, gigId));
      return winner!.setlistId;
    });
    return { ...(await this.get(bandId, setlistId)), gigId };
  }

  /** Past gigs (today or earlier) whose setlist has songs, newest first. */
  async gigHistory(
    bandId: string,
    query: GigHistoryQuery,
  ): Promise<GigHistoryEntry[]> {
    const today = new Date().toISOString().slice(0, 10);
    const text = query.q
      ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      : null;
    const songCount = sql<number>`count(${setlistItems.id})`.mapWith(Number);
    const rows = await this.db
      .select({
        gigId: gigs.id,
        title: gigs.title,
        venueName: gigs.venueName,
        date: gigs.date,
        setlistId: gigSetlists.setlistId,
        songCount,
      })
      .from(gigs)
      .innerJoin(gigSetlists, eq(gigSetlists.gigId, gigs.id))
      .innerJoin(
        setlistItems,
        eq(setlistItems.setlistId, gigSetlists.setlistId),
      )
      .innerJoin(
        songs,
        and(eq(songs.id, setlistItems.songId), isNull(songs.deletedAt)),
      )
      .where(
        and(
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
          lte(gigs.date, today),
          text
            ? or(ilike(gigs.title, text), ilike(gigs.venueName, text))
            : undefined,
        ),
      )
      .groupBy(gigs.id, gigSetlists.setlistId)
      .orderBy(desc(gigs.date), desc(gigs.startsAt), desc(gigs.id))
      .limit(query.limit);
    return rows;
  }
}
