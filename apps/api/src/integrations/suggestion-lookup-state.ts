import { Injectable } from "@nestjs/common";

const WINDOW_MS = 60_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Throttle budget and result caches shared by reference-suggestion lookups. */
@Injectable()
export class SuggestionLookupState {
  /** Odesli allows about 10 requests a minute without a key. */
  readonly odesliPerMinute = Number(process.env.ODESLI_MAX_PER_MINUTE) || 8;
  private odesliCalls: number[] = [];
  private cache = new Map<string, { at: number; value: unknown }>();

  /** Reserves one Odesli call; false when the minute's budget is spent. */
  tryTakeOdesliSlot(now = Date.now()): boolean {
    this.odesliCalls = this.odesliCalls.filter((t) => now - t < WINDOW_MS);
    if (this.odesliCalls.length >= this.odesliPerMinute) return false;
    this.odesliCalls.push(now);
    return true;
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
    this.odesliCalls = [];
    this.cache.clear();
  }
}
