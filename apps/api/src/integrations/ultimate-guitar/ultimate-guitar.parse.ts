import {
  UgParseError,
  type UgSearchResult,
  type UgTabPage,
} from "./ultimate-guitar.adapter.js";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  apos: "'",
  nbsp: " ",
};

/** Decodes the HTML entities found in attribute values (named, decimal and hex). */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return m;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

/** The `store.page.data` object from the page's js-store element. */
export function extractPageData(html: string): Obj {
  const tag = /<div[^>]*class="[^"]*\bjs-store\b[^"]*"[^>]*>/i.exec(html)?.[0];
  const raw = tag && /data-content="([^"]*)"/i.exec(tag)?.[1];
  if (!raw) throw new UgParseError("js-store element not found");
  let store: unknown;
  try {
    store = JSON.parse(decodeHtmlEntities(raw));
  } catch {
    throw new UgParseError("js-store content is not valid JSON");
  }
  const data = isObj(store) && isObj(store.store) ? store.store : null;
  const page = data && isObj(data.page) ? data.page : null;
  if (!page || !isObj(page.data)) throw new UgParseError("page data missing");
  return page.data;
}

export function parseUgSearchPage(html: string): UgSearchResult[] {
  const data = extractPageData(html);
  if (!Array.isArray(data.results)) {
    if (data.not_found) return [];
    throw new UgParseError("search results missing");
  }
  const out: UgSearchResult[] = [];
  for (const r of data.results as unknown[]) {
    if (!isObj(r)) continue;
    const url = str(r.tab_url);
    const songName = str(r.song_name);
    if (!url || !songName) continue;
    out.push({
      songName,
      artistName: str(r.artist_name) ?? "",
      type: str(r.type),
      rating: num(r.rating),
      votes: num(r.votes),
      url,
      accessType: str(r.tab_access_type),
      marketingType: str(r.marketing_type),
    });
  }
  return out;
}

export const isOfficialUrl = (url: string): boolean =>
  /\/pro\//i.test(url) || /-official-/i.test(url);

export function parseUgTabPage(html: string, url: string): UgTabPage {
  const data = extractPageData(html);
  const tab = isObj(data.tab) ? data.tab : null;
  const view = isObj(data.tab_view) ? data.tab_view : null;
  const type = tab ? str(tab.type) : null;
  const official = isOfficialUrl(url) || type === "Official" || type === "Pro";
  const empty = { content: "", key: null, capo: null, tuning: null };
  const base = {
    url,
    songName: tab ? (str(tab.song_name) ?? "") : "",
    artistName: tab ? (str(tab.artist_name) ?? "") : "",
    type,
  };
  const wiki = view && isObj(view.wiki_tab) ? view.wiki_tab : null;
  const content = wiki ? str(wiki.content) : null;
  if (official || (!tab && data.has_official_version === true)) {
    return { ...base, isOfficial: true, ...empty };
  }
  if (!tab || !view) throw new UgParseError("tab data missing");
  if (content === null) {
    if (tab.tab_access_type && tab.tab_access_type !== "public") {
      return { ...base, isOfficial: true, ...empty };
    }
    throw new UgParseError("tab content missing");
  }
  const meta = isObj(view.meta) ? view.meta : {};
  const tuning = isObj(meta.tuning) ? str(meta.tuning.value) : null;
  return {
    ...base,
    isOfficial: false,
    content,
    key: str(meta.tonality),
    capo: num(meta.capo) || null,
    tuning,
  };
}
