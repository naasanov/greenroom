import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  gigSetlists,
  gigs,
  practiceSeries,
  practiceSetlistAssignments,
  setlistItems,
  songLinks,
  songs,
  type Database,
} from "@greenroom/db";
import {
  SONG_ERROR_CODES,
  type CreateSong,
  type DeletedSong,
  type ListSongsQuery,
  type Reference,
  type ReferenceInput,
  type SongCreated,
  type SongDetail,
  type SongSummary,
  type SuggestedReference,
  type UpdateSong,
  type UsedIn,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { SONGSTERR, type SongsterrAdapter } from "../integrations/index.js";
import { SongIndex } from "./song-match.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type SongRow = typeof songs.$inferSelect;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SONGSTERR_LABEL = "Songsterr";

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, "\\$&");

@Injectable()
export class SongsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SONGSTERR) private readonly songsterr: SongsterrAdapter,
  ) {}

  // ---- list ----

  async list(bandId: string, query: ListSongsQuery): Promise<SongSummary[]> {
    // Single-table selects render interpolated columns unqualified, so the
    // correlated subqueries are written with explicit table names.
    const setlistCount = sql<number>`(
      select count(distinct si.setlist_id)::int
      from setlist_items si where si.song_id = songs.id
    )`;
    const lastPlayed = sql<string | null>`(
      select max(g.date)::text
      from setlist_items si
      join gig_setlists gs on gs.setlist_id = si.setlist_id
      join gigs g on g.id = gs.gig_id
      where si.song_id = songs.id
        and g.deleted_at is null
        and g.date <= current_date
    )`;

    const q = query.q?.trim();
    const where = and(
      eq(songs.bandId, bandId),
      isNull(songs.deletedAt),
      q
        ? or(
            ilike(songs.title, `%${escapeLike(q)}%`),
            ilike(songs.artist, `%${escapeLike(q)}%`),
          )
        : undefined,
    );

    const byTitle = [sql`lower(${songs.title}) asc`, asc(songs.id)];
    const order = {
      recent: [desc(songs.createdAt), desc(songs.id)],
      title: byTitle,
      artist: [sql`lower(${songs.artist}) asc nulls last`, ...byTitle],
      lastPlayed: [sql`"last_played" desc nulls last`, ...byTitle],
      mostPlayed: [sql`"setlist_count" desc`, ...byTitle],
    }[query.sort ?? "recent"];

    const rows = await this.db
      .select({
        song: songs,
        setlistCount: setlistCount.as("setlist_count"),
        lastPlayedDate: lastPlayed.as("last_played"),
      })
      .from(songs)
      .where(where)
      .orderBy(...order);
    return rows.map((r) => ({
      ...this.summary(r.song),
      setlistCount: r.setlistCount,
      lastPlayedDate: r.lastPlayedDate,
    }));
  }

  // ---- read ----

  async get(bandId: string, songId: string): Promise<SongDetail> {
    const song = await this.findRow(this.db, bandId, songId);
    return this.detail(song);
  }

  // ---- create ----

  async create(bandId: string, input: CreateSong): Promise<SongCreated> {
    if (!input.force) {
      const existing = await this.findDuplicate(bandId, input);
      if (existing) {
        throw new ConflictException({
          code: SONG_ERROR_CODES.duplicateSong,
          message: "Already in your library",
          songId: existing,
        });
      }
    }
    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(songs)
        .values({
          bandId,
          title: input.title,
          artist: input.artist ?? null,
          durationSeconds: input.durationSeconds ?? null,
          notes: input.notes ?? null,
          imageUrl: input.imageUrl ?? null,
          spotifyTrackId: input.spotifyTrackId ?? null,
          youtubeUrl: input.youtubeUrl ?? null,
        })
        .returning();
      await this.insertReferences(tx, created!.id, input.references ?? []);
      return created!;
    });
    const detail = await this.detail(row);
    const suggestedReference = detail.references.some(
      (r) => r.label.toLowerCase() === SONGSTERR_LABEL.toLowerCase(),
    )
      ? null
      : await this.suggestTab(input.title, input.artist ?? undefined);
    return { ...detail, suggestedReference };
  }

  // ---- update ----

  async update(
    bandId: string,
    songId: string,
    input: UpdateSong,
  ): Promise<SongDetail> {
    await this.findRow(this.db, bandId, songId);
    const { references, ...fields } = input;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    await this.db.transaction(async (tx) => {
      await tx
        .update(songs)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(songs.id, songId));
      if (references) {
        await tx.delete(songLinks).where(eq(songLinks.songId, songId));
        await this.insertReferences(tx, songId, references);
      }
    });
    return this.get(bandId, songId);
  }

  // ---- delete ----

  async remove(bandId: string, songId: string): Promise<DeletedSong> {
    await this.findRow(this.db, bandId, songId);
    const setlistCount = await this.countSetlists(songId);
    await this.db
      .update(songs)
      .set({ deletedAt: new Date() })
      .where(eq(songs.id, songId));
    return { id: songId, setlistCount };
  }

  // ---- helpers shared with the import and smart-add services ----

  async index(bandId: string): Promise<SongIndex> {
    const rows = await this.db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        spotifyTrackId: songs.spotifyTrackId,
      })
      .from(songs)
      .where(and(eq(songs.bandId, bandId), isNull(songs.deletedAt)));
    return new SongIndex(rows);
  }

  async findDuplicate(
    bandId: string,
    input: {
      title: string;
      artist?: string | null;
      spotifyTrackId?: string | null;
    },
  ): Promise<string | null> {
    return (await this.index(bandId)).find(input);
  }

  async suggestTab(
    title: string,
    artist?: string,
  ): Promise<SuggestedReference | null> {
    try {
      const hit = await this.songsterr.searchTab({ title, artist });
      return hit ? { label: SONGSTERR_LABEL, value: hit.url } : null;
    } catch {
      // A failed lookup only loses the suggestion.
      return null;
    }
  }

  // ---- internals ----

  private summary(
    s: SongRow,
  ): Omit<SongSummary, "setlistCount" | "lastPlayedDate"> {
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      durationSeconds: s.durationSeconds,
      imageUrl: s.imageUrl,
      spotifyTrackId: s.spotifyTrackId,
      youtubeUrl: s.youtubeUrl,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private async findRow(
    db: Database | Tx,
    bandId: string,
    songId: string,
  ): Promise<SongRow> {
    if (!UUID_RE.test(songId)) throw new NotFoundException("Song not found");
    const [row] = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.bandId, bandId),
          isNull(songs.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException("Song not found");
    return row;
  }

  private async insertReferences(
    tx: Tx,
    songId: string,
    refs: ReferenceInput[],
  ): Promise<void> {
    if (refs.length === 0) return;
    await tx.insert(songLinks).values(
      refs.map((r, position) => ({
        songId,
        label: r.label,
        value: r.value,
        position,
      })),
    );
  }

  private async countSetlists(songId: string): Promise<number> {
    const [row] = await this.db
      .select({
        n: sql<number>`count(distinct ${setlistItems.setlistId})::int`,
      })
      .from(setlistItems)
      .where(eq(setlistItems.songId, songId));
    return row?.n ?? 0;
  }

  private async detail(song: SongRow): Promise<SongDetail> {
    const [refs, setlistCount, lastPlayedDate, usedIn] = await Promise.all([
      this.db
        .select()
        .from(songLinks)
        .where(eq(songLinks.songId, song.id))
        .orderBy(asc(songLinks.position), asc(songLinks.id)),
      this.countSetlists(song.id),
      this.lastPlayed(song.id),
      this.usedIn(song.id),
    ]);
    const references: Reference[] = refs.map((r) => ({
      id: r.id,
      label: r.label,
      value: r.value,
      position: r.position,
    }));
    return {
      ...this.summary(song),
      setlistCount,
      lastPlayedDate,
      bandId: song.bandId,
      notes: song.notes,
      updatedAt: song.updatedAt.toISOString(),
      references,
      usedIn,
    };
  }

  private async lastPlayed(songId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ d: sql<string | null>`max(${gigs.date})::text` })
      .from(setlistItems)
      .innerJoin(gigSetlists, eq(gigSetlists.setlistId, setlistItems.setlistId))
      .innerJoin(gigs, eq(gigs.id, gigSetlists.gigId))
      .where(
        and(
          eq(setlistItems.songId, songId),
          isNull(gigs.deletedAt),
          sql`${gigs.date} <= current_date`,
        ),
      );
    return row?.d ?? null;
  }

  private async usedIn(songId: string): Promise<UsedIn[]> {
    const setlistIds = this.db
      .selectDistinct({ id: setlistItems.setlistId })
      .from(setlistItems)
      .where(eq(setlistItems.songId, songId));
    const [gigRows, practiceRows] = await Promise.all([
      this.db
        .select({
          setlistId: gigSetlists.setlistId,
          gigId: gigs.id,
          title: gigs.title,
          date: gigs.date,
        })
        .from(gigSetlists)
        .innerJoin(gigs, eq(gigs.id, gigSetlists.gigId))
        .where(
          and(
            inArray(gigSetlists.setlistId, setlistIds),
            isNull(gigs.deletedAt),
          ),
        )
        .orderBy(desc(gigs.date), asc(gigs.id)),
      this.db
        .select({
          setlistId: practiceSetlistAssignments.setlistId,
          seriesId: practiceSeries.id,
          title: practiceSeries.title,
          effectiveFrom: practiceSetlistAssignments.effectiveFrom,
        })
        .from(practiceSetlistAssignments)
        .innerJoin(
          practiceSeries,
          eq(practiceSeries.id, practiceSetlistAssignments.seriesId),
        )
        .where(inArray(practiceSetlistAssignments.setlistId, setlistIds))
        .orderBy(desc(practiceSetlistAssignments.effectiveFrom)),
    ]);
    return [
      ...gigRows.map((g): UsedIn => ({
        kind: "gig",
        setlistId: g.setlistId,
        gigId: g.gigId,
        title: g.title,
        date: g.date,
      })),
      ...practiceRows.map((p): UsedIn => ({
        kind: "practice",
        setlistId: p.setlistId!,
        seriesId: p.seriesId,
        title: p.title,
        effectiveFrom: p.effectiveFrom.toISOString(),
      })),
    ];
  }
}
