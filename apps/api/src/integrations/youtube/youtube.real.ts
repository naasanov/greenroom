import { notImplemented } from "../not-implemented.js";
import type { YoutubeAdapter, YoutubeVideoResult } from "./youtube.adapter.js";

export class RealYoutubeAdapter implements YoutubeAdapter {
  getVideoMetadata(): Promise<YoutubeVideoResult> {
    return notImplemented("YouTube", "3.3");
  }
}
