import { notImplemented } from "../not-implemented.js";
import type { SongsterrAdapter } from "./songsterr.adapter.js";

export class RealSongsterrAdapter implements SongsterrAdapter {
  searchTab(): Promise<{ url: string } | null> {
    return notImplemented("Songsterr", "3.3");
  }
}
