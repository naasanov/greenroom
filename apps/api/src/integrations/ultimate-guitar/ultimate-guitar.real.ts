import { Logger } from "@nestjs/common";
import { isUltimateGuitarUrl } from "@greenroom/shared";
import {
  UgUnavailableError,
  type UgSearchResult,
  type UgTabPage,
  type UltimateGuitarAdapter,
} from "./ultimate-guitar.adapter.js";
import {
  isOfficialUrl,
  parseUgSearchPage,
  parseUgTabPage,
} from "./ultimate-guitar.parse.js";
import { httpRequest } from "../http.js";

const log = new Logger("UltimateGuitarAdapter");
const SEARCH_URL = "https://www.ultimate-guitar.com/search.php";
const TIMEOUT_MS = 10_000;
const MIN_GAP_MS = 1_500;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Process-wide: one request at a time, at least MIN_GAP_MS between starts.
let queue: Promise<unknown> = Promise.resolve();
let lastStart = 0;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

const MAX_REDIRECTS = 3;

function assertUgUrl(url: string): void {
  if (!isUltimateGuitarUrl(url)) {
    throw new UgUnavailableError("Refusing to fetch a non-Ultimate Guitar URL");
  }
}

async function getHtml(url: string): Promise<{ html: string; url: string }> {
  assertUgUrl(url);
  return throttled(async () => {
    try {
      let current = url;
      for (let hop = 0; ; hop++) {
        const res = await httpRequest(
          current,
          {
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "manual",
          },
          { timeoutMs: TIMEOUT_MS },
        );
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location || hop >= MAX_REDIRECTS) {
            throw new UgUnavailableError("Too many or invalid redirects");
          }
          current = new URL(location, current).toString();
          assertUgUrl(current);
          continue;
        }
        if (!res.ok) {
          log.warn(`request failed status=${res.status}`);
          throw new UgUnavailableError(
            `Ultimate Guitar returned ${res.status}`,
          );
        }
        return { html: await res.text(), url: current };
      }
    } catch (err) {
      if (err instanceof UgUnavailableError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`request errored: ${msg}`);
      throw new UgUnavailableError(`Ultimate Guitar request failed: ${msg}`);
    }
  });
}

/** Reads Ultimate Guitar's public pages by parsing the embedded js-store JSON. */
export class RealUltimateGuitarAdapter implements UltimateGuitarAdapter {
  async search(query: string): Promise<UgSearchResult[]> {
    const params = new URLSearchParams({ search_type: "title", value: query });
    const { html } = await getHtml(`${SEARCH_URL}?${params}`);
    return parseUgSearchPage(html);
  }

  async fetchTab(url: string): Promise<UgTabPage> {
    // Official pages redirect to a paywalled viewer, so they are not fetched.
    if (isOfficialUrl(url)) {
      return {
        url,
        songName: "",
        artistName: "",
        type: "Official",
        isOfficial: true,
        content: "",
        key: null,
        capo: null,
        tuning: null,
      };
    }
    const { html, url: finalUrl } = await getHtml(url);
    return parseUgTabPage(html, isOfficialUrl(finalUrl) ? finalUrl : url);
  }
}
