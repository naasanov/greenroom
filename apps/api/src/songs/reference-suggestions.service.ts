import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { songLinkCache, type Database } from "@greenroom/db";
import {
  SUGGESTIBLE_REFERENCES,
  type ReferenceSuggestion,
  type SuggestReferences,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  MUSICLINK,
  SuggestionLookupState,
  type MusicLinkAdapter,
  type MusicLinkLinks,
} from "../integrations/index.js";
import { normalizeSourceUrl } from "./source-url.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows with links stay fresh for 30 days; no-match rows for 7. */
export const HIT_TTL_MS = 30 * DAY_MS;
export const EMPTY_TTL_MS = 7 * DAY_MS;

const log = new Logger("ReferenceSuggestions");

export function isFresh(
  links: MusicLinkLinks,
  fetchedAt: Date,
  now = Date.now(),
): boolean {
  const ttl = Object.keys(links).length > 0 ? HIT_TTL_MS : EMPTY_TTL_MS;
  return now - fetchedAt.getTime() < ttl;
}

/** Looks up whitelisted references for a song; any failure just yields fewer. */
@Injectable()
export class ReferenceSuggestionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(MUSICLINK) private readonly musiclink: MusicLinkAdapter,
    private readonly state: SuggestionLookupState,
  ) {}

  async suggest(input: SuggestReferences): Promise<ReferenceSuggestion[]> {
    const links = await this.streamingLinks(input.sourceUrl);
    const out: ReferenceSuggestion[] = [];
    for (const ref of SUGGESTIBLE_REFERENCES) {
      const value = links[ref.musiclink];
      if (value) out.push({ key: ref.key, label: ref.label, value });
    }
    return out;
  }

  private async streamingLinks(sourceUrl?: string): Promise<MusicLinkLinks> {
    const key = normalizeSourceUrl(sourceUrl);
    if (!key) return {};
    const cached = this.state.getCached<MusicLinkLinks>(key);
    if (cached) return cached;
    try {
      return await this.state.shared(key, () => this.resolve(key));
    } catch {
      return {};
    }
  }

  /** Table first, then MusicLink; a failed refetch serves the stale row untouched. */
  private async resolve(key: string): Promise<MusicLinkLinks> {
    const row = await this.readRow(key);
    if (row && isFresh(row.links, row.fetchedAt)) {
      this.state.setCached(key, row.links);
      return row.links;
    }
    const stale = row?.links ?? {};
    if (this.state.isBackedOff()) return stale;
    try {
      const { links, retryAfterSeconds } = await this.musiclink.findLinks(key);
      if (retryAfterSeconds) this.state.backOff(retryAfterSeconds);
      if (!links) return stale;
      await this.writeRow(key, links);
      this.state.setCached(key, links);
      return links;
    } catch {
      return stale;
    }
  }

  private async readRow(
    key: string,
  ): Promise<{ links: MusicLinkLinks; fetchedAt: Date } | null> {
    try {
      const [row] = await this.db
        .select({
          links: songLinkCache.links,
          fetchedAt: songLinkCache.fetchedAt,
        })
        .from(songLinkCache)
        .where(eq(songLinkCache.sourceUrl, key))
        .limit(1);
      return row ?? null;
    } catch (err) {
      log.warn(`link cache read failed: ${String(err)}`);
      return null;
    }
  }

  private async writeRow(key: string, links: MusicLinkLinks): Promise<void> {
    try {
      await this.db
        .insert(songLinkCache)
        .values({ sourceUrl: key, links, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: songLinkCache.sourceUrl,
          set: { links, fetchedAt: new Date() },
        });
    } catch (err) {
      log.warn(`link cache write failed: ${String(err)}`);
    }
  }
}
