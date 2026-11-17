import { Injectable } from "@nestjs/common";

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

/** In-memory result layer, in-flight merging and rate-limit back-off for suggestion lookups. */
@Injectable()
export class SuggestionLookupState {
  private backoffUntil = 0;
  private cache = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();

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

  /** Stores a value, evicting the oldest entry beyond the size bound. */
  setCached(key: string, value: unknown, now = Date.now()): void {
    this.cache.delete(key);
    this.cache.set(key, { at: now, value });
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  /** Runs `work` once per key; concurrent callers share the same promise. */
  shared<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const promise = work().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  /** Empties the in-memory results; back-off is kept. */
  clearCache(): void {
    this.cache.clear();
  }

  reset(): void {
    this.backoffUntil = 0;
    this.cache.clear();
    this.inflight.clear();
  }
}
