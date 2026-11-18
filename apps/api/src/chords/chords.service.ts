import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  bands,
  songChordSheets,
  songs,
  ugSearchCache,
  type Database,
} from "@greenroom/db";
import {
  CHORD_ERROR_CODES,
  parsePlainText,
  parseUgMarkup,
  prefersFlats,
  transposeSheet,
  type ChordSheet,
  type ChordsIndex,
  type ChordsSuggestion,
  type SongChordSheet,
  type UgVersion,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  ULTIMATE_GUITAR,
  UgParseError,
  UgUnavailableError,
  type UgSearchResult,
  type UltimateGuitarAdapter,
} from "../integrations/index.js";
import { normalizeText, titleArtistKey } from "../songs/song-match.js";
import { chordsEnabledFor } from "./chords.flag.js";

type SheetRow = typeof songChordSheets.$inferSelect;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_VOTES = 20;
const MAX_VERSIONS = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasChords = (sheet: ChordSheet): boolean =>
  sheet.lines.some((l) => l.kind === "line" && l.chords.length > 0);

@Injectable()
export class ChordsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ULTIMATE_GUITAR) private readonly ug: UltimateGuitarAdapter,
  ) {}

  // ---- feature flag ----

  /** Reads the flag per request; a disabled band gets the same 404 as a missing route. */
  private async isEnabled(bandId: string): Promise<boolean> {
    const [band] = await this.db
      .select({ id: bands.id, slug: bands.slug })
      .from(bands)
      .where(eq(bands.id, bandId))
      .limit(1);
    return !!band && chordsEnabledFor(band);
  }

  private async requireEnabled(bandId: string): Promise<void> {
    if (!(await this.isEnabled(bandId))) {
      throw new NotFoundException("Not found");
    }
  }

  // ---- index and reads ----

  async index(bandId: string): Promise<ChordsIndex> {
    if (!(await this.isEnabled(bandId))) return { enabled: false, songIds: [] };
    const rows = await this.db
      .select({ songId: songChordSheets.songId })
      .from(songChordSheets)
      .innerJoin(songs, eq(songs.id, songChordSheets.songId))
      .where(and(eq(songs.bandId, bandId), isNull(songs.deletedAt)));
    return { enabled: true, songIds: rows.map((r) => r.songId) };
  }

  async sheets(bandId: string, songIds: string[]): Promise<SongChordSheet[]> {
    await this.requireEnabled(bandId);
    if (songIds.length === 0) return [];
    const rows = await this.db
      .select({ sheet: songChordSheets })
      .from(songChordSheets)
      .innerJoin(songs, eq(songs.id, songChordSheets.songId))
      .where(
        and(
          eq(songs.bandId, bandId),
          isNull(songs.deletedAt),
          inArray(songChordSheets.songId, songIds),
        ),
      );
    return rows.map((r) => this.toDto(r.sheet));
  }

  async get(bandId: string, songId: string): Promise<SongChordSheet> {
    await this.requireEnabled(bandId);
    await this.requireSong(bandId, songId);
    return this.toDto(await this.requireSheet(songId));
  }

  // ---- suggest ----

  /** Never throws: any failure yields an empty suggestion and nothing is cached. */
  async suggest(
    bandId: string,
    title: string,
    artist: string | null,
  ): Promise<ChordsSuggestion> {
    await this.requireEnabled(bandId);
    try {
      const results = await this.searchCached(title, artist);
      return this.pick(results, title, artist);
    } catch {
      return { match: null, versions: [] };
    }
  }

  private readonly inFlight = new Map<string, Promise<UgSearchResult[]>>();

  private searchCached(
    title: string,
    artist: string | null,
  ): Promise<UgSearchResult[]> {
    const key = titleArtistKey(title, artist);
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = this.searchUncached(key, title, artist).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, p);
    return p;
  }

  private async searchUncached(
    key: string,
    title: string,
    artist: string | null,
  ): Promise<UgSearchResult[]> {
    const [cached] = await this.db
      .select()
      .from(ugSearchCache)
      .where(eq(ugSearchCache.queryKey, key))
      .limit(1);
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      return cached.results;
    }
    const results = await this.ug.search(`${title} ${artist ?? ""}`.trim());
    try {
      await this.db
        .insert(ugSearchCache)
        .values({ queryKey: key, results, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: ugSearchCache.queryKey,
          set: { results, fetchedAt: new Date() },
        });
    } catch {
      // A cache write failure must not discard a good result.
    }
    return results;
  }

  private pick(
    results: UgSearchResult[],
    title: string,
    artist: string | null,
  ): ChordsSuggestion {
    const wantTitle = normalizeText(title);
    const wantArtist = normalizeText(artist);
    const candidates = results.filter(
      (r) =>
        r.type === "Chords" &&
        !r.marketingType &&
        normalizeText(r.songName) === wantTitle &&
        (!wantArtist ||
          !normalizeText(r.artistName) ||
          normalizeText(r.artistName) === wantArtist),
    );
    if (candidates.length === 0) return { match: null, versions: [] };
    const votes = (r: UgSearchResult) => r.votes ?? 0;
    const rating = (r: UgSearchResult) => r.rating ?? 0;
    const trusted = candidates.filter((r) => votes(r) >= MIN_VOTES);
    const best = (list: UgSearchResult[], by: (r: UgSearchResult) => number) =>
      list.reduce((a, b) => (by(b) > by(a) ? b : a));
    const match =
      trusted.length > 0 ? best(trusted, rating) : best(candidates, votes);
    const toVersion = (r: UgSearchResult): UgVersion => ({
      url: r.url,
      songName: r.songName,
      artistName: r.artistName,
      rating: rating(r),
      votes: votes(r),
    });
    return {
      match: toVersion(match),
      versions: candidates
        .filter((r) => r !== match)
        .sort((a, b) => rating(b) - rating(a))
        .slice(0, MAX_VERSIONS)
        .map(toVersion),
    };
  }

  // ---- writes ----

  async importSheet(
    bandId: string,
    songId: string,
    url: string,
  ): Promise<SongChordSheet> {
    await this.requireEnabled(bandId);
    await this.requireSong(bandId, songId);
    const failed = (message: string) =>
      new BadGatewayException({ code: CHORD_ERROR_CODES.failed, message });

    let page;
    try {
      page = await this.ug.fetchTab(url);
    } catch (e) {
      if (e instanceof UgUnavailableError || e instanceof UgParseError) {
        throw failed("Couldn't import chords from this link");
      }
      throw e;
    }
    if (page.isOfficial) {
      throw new UnprocessableEntityException({
        code: CHORD_ERROR_CODES.official,
        message: "Official tabs can't be imported; pick a community version",
      });
    }
    // Stored at concert pitch: capo N means the shapes sound N semitones up.
    const sheet = transposeSheet(
      parseUgMarkup(page.content),
      page.capo ?? 0,
      page.key ? prefersFlats(page.key) : undefined,
    );
    if (!hasChords(sheet)) throw failed("No chords found on this page");

    const now = new Date();
    const values = {
      sheet,
      source: "ultimate-guitar",
      sourceUrl: this.canonicalUrl(url),
      key: page.key,
      capo: page.capo,
      tuning: page.tuning,
      importedAt: now,
      editedAt: null,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(songChordSheets)
      .values({ songId, ...values })
      .onConflictDoUpdate({ target: songChordSheets.songId, set: values })
      .returning();
    return this.toDto(row!);
  }

  async save(
    bandId: string,
    songId: string,
    text: string,
  ): Promise<SongChordSheet> {
    await this.requireEnabled(bandId);
    await this.requireSong(bandId, songId);
    const sheet = parsePlainText(text);
    if (sheet.lines.every((l) => l.kind === "text" && !l.text.trim())) {
      throw new BadRequestException({
        code: "EMPTY_CHORD_SHEET",
        message: "The chord sheet is empty",
      });
    }
    const now = new Date();
    // Single upsert: a manual sheet on first save, else replace and mark UG sheets edited.
    const [row] = await this.db
      .insert(songChordSheets)
      .values({ songId, sheet, source: "manual" })
      .onConflictDoUpdate({
        target: songChordSheets.songId,
        set: {
          sheet,
          updatedAt: now,
          editedAt: sql`case when ${songChordSheets.source} = 'ultimate-guitar' then ${now.toISOString()}::timestamptz else ${songChordSheets.editedAt} end`,
        },
      })
      .returning();
    return this.toDto(row!);
  }

  async setBandTranspose(
    bandId: string,
    songId: string,
    semitones: number,
  ): Promise<SongChordSheet> {
    await this.requireEnabled(bandId);
    await this.requireSong(bandId, songId);
    const [row] = await this.db
      .update(songChordSheets)
      .set({ bandTranspose: semitones, updatedAt: new Date() })
      .where(eq(songChordSheets.songId, songId))
      .returning();
    if (!row) throw this.noSheet();
    return this.toDto(row);
  }

  async remove(bandId: string, songId: string): Promise<void> {
    await this.requireEnabled(bandId);
    await this.requireSong(bandId, songId);
    await this.db
      .delete(songChordSheets)
      .where(eq(songChordSheets.songId, songId));
  }

  // ---- helpers ----

  /** The pasted URL without query or fragment (the page URL is that same address). */
  private canonicalUrl(fetched: string): string {
    const x = new URL(fetched);
    x.search = "";
    x.hash = "";
    return x.toString();
  }

  private async requireSong(bandId: string, songId: string): Promise<void> {
    if (!UUID_RE.test(songId)) throw new NotFoundException("Song not found");
    const [song] = await this.db
      .select({ id: songs.id })
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.bandId, bandId),
          isNull(songs.deletedAt),
        ),
      )
      .limit(1);
    if (!song) throw new NotFoundException("Song not found");
  }

  private noSheet(): NotFoundException {
    return new NotFoundException({
      code: CHORD_ERROR_CODES.noSheet,
      message: "This song has no chord sheet",
    });
  }

  private async requireSheet(songId: string): Promise<SheetRow> {
    const [row] = await this.db
      .select()
      .from(songChordSheets)
      .where(eq(songChordSheets.songId, songId))
      .limit(1);
    if (!row) throw this.noSheet();
    return row;
  }

  private toDto(row: SheetRow): SongChordSheet {
    return {
      songId: row.songId,
      sheet: row.sheet as ChordSheet,
      source: row.source as SongChordSheet["source"],
      sourceUrl: row.sourceUrl,
      key: row.key,
      capo: row.capo,
      tuning: row.tuning,
      bandTranspose: row.bandTranspose,
      editedAt: row.editedAt?.toISOString() ?? null,
      importedAt: row.importedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
