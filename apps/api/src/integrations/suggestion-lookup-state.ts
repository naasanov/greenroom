import { Injectable } from "@nestjs/common";

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

/** Result cache and rate-limit back-off shared by reference-suggestion lookups. */
@Injectable()
export class SuggestionLookupState {
  private backoffUntil = 0;
  private cache = new Map<string, { at: number; value: unknown }>();

  /** True while a provider's Retry-After window is still open. */
  isBackedOff(now = Date.now()): boolean {
    return now < this.backoffUntil;
  }

  /** Pauses lookups for the provider's requested interval. */
  backOff(seconds: number, now = Date.now()): void {
    const ms = Math.min(seconds, MAX_BACKOFF_SECONDS) * 1000;
    this.backoffUntil = Math.max(this.backoffUntil, now + ms);
  }

  getCached<T>(key: string, now = Date.now()): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (now - hit.at >= CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  setCached(key: string, value: unknown, now = Date.now()): void {
    this.cache.set(key, { at: now, value });
  }

  reset(): void {
    this.backoffUntil = 0;
    this.cache.clear();
  }
}
