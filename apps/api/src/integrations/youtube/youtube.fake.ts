import {
  parseYoutubeId,
  youtubePlaylistUrl,
  type YoutubeAddItemsResult,
  type YoutubeAdapter,
  type YoutubeCreatePlaylistResult,
  type YoutubeVideo,
  type YoutubeVideoResult,
} from "./youtube.adapter.js";

const DEFAULT_VIDEOS: YoutubeVideo[] = [
  {
    videoId: "fakeVid0001",
    title: "Fake Band - Live at the Garage",
    channelName: "Fake Band",
    thumbnailUrl: "https://fake-youtube.test/thumb/fakeVid0001.jpg",
    durationSeconds: 215,
  },
  {
    videoId: "fakeVid0002",
    title: "Backing Track in E",
    channelName: "Jam Tracks",
    thumbnailUrl: "https://fake-youtube.test/thumb/fakeVid0002.jpg",
    durationSeconds: 3725,
  },
];

export interface FakeYoutubePlaylist {
  id: string;
  name: string;
  isPublic: boolean;
  videoIds: string[];
}

/** User tokens issued by the fake Google OAuth adapter. */
const isUserToken = (token: string): boolean =>
  token.startsWith("fake-access-");

export class FakeYoutubeAdapter implements YoutubeAdapter {
  private videos = new Map<string, YoutubeVideo>();
  private playlists: FakeYoutubePlaylist[] = [];
  private quotaExceeded = false;
  private unavailable = new Set<string>();

  constructor() {
    this.reset();
  }

  async getVideoMetadata(url: string): Promise<YoutubeVideoResult> {
    const id = parseYoutubeId(url);
    const v = id ? this.videos.get(id) : undefined;
    return v ? { status: "ok", video: { ...v } } : { status: "not-found" };
  }

  async createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<YoutubeCreatePlaylistResult> {
    if (!isUserToken(userToken)) return { status: "unauthorized" };
    if (this.quotaExceeded) return { status: "quota-exceeded" };
    const id = `fakeYtPlaylist${this.playlists.length + 1}`;
    this.playlists.push({
      id,
      name: input.name,
      isPublic: input.isPublic ?? false,
      videoIds: [],
    });
    return {
      status: "ok",
      playlist: { id, url: youtubePlaylistUrl(id), name: input.name },
    };
  }

  async addPlaylistItems(
    userToken: string,
    playlistId: string,
    videoIds: string[],
  ): Promise<YoutubeAddItemsResult> {
    if (!isUserToken(userToken)) return { status: "unauthorized" };
    const playlist = this.playlists.find((p) => p.id === playlistId);
    if (!playlist) return { status: "not-found" };
    if (this.quotaExceeded) return { status: "quota-exceeded" };
    const added: string[] = [];
    const rejected: string[] = [];
    for (const id of videoIds) {
      if (this.unavailable.has(id)) rejected.push(id);
      else added.push(id);
    }
    playlist.videoIds.push(...added);
    return { status: "ok", added, rejected };
  }

  // ---- test controls ----

  /** Makes playlist writes fail as if the daily Data API quota ran out. */
  setQuotaExceeded(on: boolean): void {
    this.quotaExceeded = on;
  }

  /** Makes the given video ids refused when added to a playlist. */
  setUnavailableVideos(ids: string[]): void {
    this.unavailable = new Set(ids);
  }

  /** Playlists created through export, in creation order. */
  createdPlaylists(): FakeYoutubePlaylist[] {
    return this.playlists.map((p) => ({ ...p, videoIds: [...p.videoIds] }));
  }

  seedVideo(video: YoutubeVideo): void {
    this.videos.set(video.videoId, video);
  }

  reset(): void {
    this.playlists = [];
    this.quotaExceeded = false;
    this.unavailable = new Set();
    this.videos = new Map(DEFAULT_VIDEOS.map((v) => [v.videoId, v]));
  }
}
