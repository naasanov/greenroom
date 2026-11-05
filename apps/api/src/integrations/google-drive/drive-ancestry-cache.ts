import { Injectable } from "@nestjs/common";
import type { DriveFile } from "./google-drive.adapter.js";

const ttlMs = (): number =>
  Number(process.env.DRIVE_ANCESTRY_CACHE_TTL_MS ?? 60_000);
const MAX_ENTRIES = 5_000;

interface Entry {
  chain: DriveFile[];
  expires: number;
}

/**
 * Short-lived cache of verified folder chains (folder up to the Files root).
 * Any Drive mutation made through the adapter clears it; Drive edits made
 * elsewhere are picked up when the TTL lapses (DRIVE_ANCESTRY_CACHE_TTL_MS, 0 disables).
 */
@Injectable()
export class DriveAncestryCache {
  private entries = new Map<string, Entry>();
  private generation = 0;

  private key(token: string, rootId: string, id: string): string {
    return `${token}\0${rootId}\0${id}`;
  }

  get(token: string, rootId: string, id: string): DriveFile[] | null {
    const k = this.key(token, rootId, id);
    const hit = this.entries.get(k);
    if (!hit) return null;
    if (hit.expires <= Date.now()) {
      this.entries.delete(k);
      return null;
    }
    return hit.chain;
  }

  /** Current mutation epoch; pass it back to `set` so writes from walks that raced a mutation are dropped. */
  epoch(): number {
    return this.generation;
  }

  set(token: string, rootId: string, chain: DriveFile[], epoch: number): void {
    if (epoch !== this.generation || !chain.length || ttlMs() <= 0) return;
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(this.key(token, rootId, chain[0]!.id), {
      chain,
      expires: Date.now() + ttlMs(),
    });
  }

  clear(): void {
    this.generation++;
    this.entries.clear();
  }
}
