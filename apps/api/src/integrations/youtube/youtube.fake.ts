import {
  parseYoutubeId,
  type YoutubeAdapter,
  type YoutubeVideo,
  type YoutubeVideoResult,
} from "./youtube.adapter.js";

const DEFAULT_VIDEOS: YoutubeVideo[] = [
  {
    videoId: "fakeVid0001",
    title: "Fake Band - Live at the Garage",
    channelName: "Fake Band",
    thumbnailUrl: "https://fake-youtube.test/thumb/fakeVid0001.jpg",
  },
  {
    videoId: "fakeVid0002",
    title: "Backing Track in E",
    channelName: "Jam Tracks",
    thumbnailUrl: "https://fake-youtube.test/thumb/fakeVid0002.jpg",
  },
];

export class FakeYoutubeAdapter implements YoutubeAdapter {
  private videos = new Map<string, YoutubeVideo>();

  constructor() {
    this.reset();
  }

  async getVideoMetadata(url: string): Promise<YoutubeVideoResult> {
    const id = parseYoutubeId(url);
    const v = id ? this.videos.get(id) : undefined;
    return v ? { status: "ok", video: { ...v } } : { status: "not-found" };
  }

  // ---- test controls ----

  seedVideo(video: YoutubeVideo): void {
    this.videos.set(video.videoId, video);
  }

  reset(): void {
    this.videos = new Map(DEFAULT_VIDEOS.map((v) => [v.videoId, v]));
  }
}
