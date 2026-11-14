import { Logger } from "@nestjs/common";
import { SUGGESTIBLE_REFERENCES } from "@greenroom/shared";
import type { OdesliAdapter, OdesliLinks } from "./odesli.adapter.js";

const log = new Logger("OdesliAdapter");
const LINKS_URL = "https://api.song.link/v1-alpha.1/links";
const TIMEOUT_MS = 5000;

interface OdesliResponse {
  pageUrl?: unknown;
  linksByPlatform?: Record<string, { url?: unknown } | undefined>;
}

const isResponse = (v: unknown): v is OdesliResponse =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Resolves a track link through Odesli, keeping only whitelisted platforms. */
export class RealOdesliAdapter implements OdesliAdapter {
  async findLinks(sourceUrl: string): Promise<OdesliLinks | null> {
    try {
      const params = new URLSearchParams({ url: sourceUrl });
      if (process.env.ODESLI_API_KEY)
        params.set("key", process.env.ODESLI_API_KEY);
      const res = await fetch(`${LINKS_URL}?${params}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        log.warn(`link lookup failed status=${res.status}`);
        return null;
      }
      const body: unknown = await res.json();
      if (!isResponse(body)) return null;
      // An unresolvable link is a 200 with an empty page URL.
      if (typeof body.pageUrl !== "string" || !body.pageUrl) return {};
      const out: OdesliLinks = {};
      for (const ref of SUGGESTIBLE_REFERENCES) {
        if (!("odesli" in ref)) continue;
        const url = body.linksByPlatform?.[ref.odesli]?.url;
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          out[ref.odesli] = url;
        }
      }
      return out;
    } catch (err) {
      log.warn(
        `link lookup errored: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
