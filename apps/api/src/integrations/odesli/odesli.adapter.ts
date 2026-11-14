export const ODESLI = Symbol("ODESLI");

/** Platform links for one track, keyed by Odesli platform name. */
export type OdesliLinks = Record<string, string>;

export interface OdesliAdapter {
  /**
   * The same track on other platforms, from a link on any platform. An
   * empty object means no match; null means the lookup failed.
   */
  findLinks(sourceUrl: string): Promise<OdesliLinks | null>;
}
