import { Inject, Injectable } from "@nestjs/common";
import {
  SUGGESTIBLE_REFERENCES,
  type ReferenceSuggestion,
  type SuggestReferences,
} from "@greenroom/shared";
import {
  MUSICLINK,
  SuggestionLookupState,
  type MusicLinkAdapter,
  type MusicLinkLinks,
} from "../integrations/index.js";

/** Looks up whitelisted references for a song; any failure just yields fewer. */
@Injectable()
export class ReferenceSuggestionsService {
  constructor(
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
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return {};
    const key = `musiclink:${sourceUrl}`;
    const cached = this.state.getCached<MusicLinkLinks>(key);
    if (cached) return cached;
    if (this.state.isBackedOff()) return {};
    try {
      const { links, retryAfterSeconds } =
        await this.musiclink.findLinks(sourceUrl);
      if (retryAfterSeconds) this.state.backOff(retryAfterSeconds);
      if (!links) return {};
      this.state.setCached(key, links);
      return links;
    } catch {
      return {};
    }
  }
}
