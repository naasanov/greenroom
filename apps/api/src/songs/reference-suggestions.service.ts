import { Inject, Injectable } from "@nestjs/common";
import {
  SUGGESTIBLE_REFERENCES,
  type ReferenceSuggestion,
  type SuggestReferences,
} from "@greenroom/shared";
import {
  ODESLI,
  SONGSTERR,
  SuggestionLookupState,
  type OdesliAdapter,
  type OdesliLinks,
  type SongsterrAdapter,
  type SongsterrTabs,
} from "../integrations/index.js";

const norm = (s: string): string => s.trim().toLowerCase();

/** Looks up whitelisted references for a song; any failure just yields fewer. */
@Injectable()
export class ReferenceSuggestionsService {
  constructor(
    @Inject(ODESLI) private readonly odesli: OdesliAdapter,
    @Inject(SONGSTERR) private readonly songsterr: SongsterrAdapter,
    private readonly state: SuggestionLookupState,
  ) {}

  async suggest(input: SuggestReferences): Promise<ReferenceSuggestion[]> {
    const [links, tabs] = await Promise.all([
      this.streamingLinks(input.sourceUrl),
      this.tabs(input.title, input.artist),
    ]);
    const out: ReferenceSuggestion[] = [];
    for (const ref of SUGGESTIBLE_REFERENCES) {
      const value = "odesli" in ref ? links[ref.odesli] : tabs[ref.songsterr];
      if (value) out.push({ key: ref.key, label: ref.label, value });
    }
    return out;
  }

  private async streamingLinks(sourceUrl?: string): Promise<OdesliLinks> {
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return {};
    const key = `odesli:${sourceUrl}`;
    const cached = this.state.getCached<OdesliLinks>(key);
    if (cached) return cached;
    if (!this.state.tryTakeOdesliSlot()) return {};
    try {
      const links = await this.odesli.findLinks(sourceUrl);
      if (!links) return {};
      this.state.setCached(key, links);
      return links;
    } catch {
      return {};
    }
  }

  private async tabs(title: string, artist?: string): Promise<SongsterrTabs> {
    const key = `songsterr:${norm(title)}|${norm(artist ?? "")}`;
    const cached = this.state.getCached<SongsterrTabs>(key);
    if (cached) return cached;
    try {
      const tabs = await this.songsterr.findTabs({ title, artist });
      if (!tabs) return {};
      this.state.setCached(key, tabs);
      return tabs;
    } catch {
      return {};
    }
  }
}
