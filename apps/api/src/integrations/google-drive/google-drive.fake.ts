import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DRIVE_FOLDER_MIME,
  type DriveChange,
  type DriveChangesResult,
  type DriveDownloadResult,
  type DriveFile,
  type DriveFileResult,
  type GoogleDriveAdapter,
  type StartUploadInput,
  type UploadChunkInput,
  type UploadChunkResult,
  type UploadStatusResult,
} from "./google-drive.adapter.js";

export const FAKE_DRIVE_ROOT_ID = "root";

interface Session {
  input: StartUploadInput;
  received: Buffer[];
  receivedBytes: number;
  fileId: string | null;
  /** When set, the next chunk keeps only this many bytes then fails. */
  interruptAfterBytes: number | null;
}

export class FakeGoogleDriveAdapter implements GoogleDriveAdapter {
  private files = new Map<string, DriveFile>();
  private contents = new Map<string, Buffer>();
  private sessions = new Map<string, Session>();
  private changeLog: DriveChange[] = [];
  private idCounter = 0;
  private sessionCounter = 0;
  private clock = 0;

  constructor() {
    this.reset();
  }

  // ---- adapter ----

  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string },
  ): Promise<DriveFile> {
    this.lastAccessToken = accessToken;
    return this.insert(
      input.name,
      DRIVE_FOLDER_MIME,
      input.parentId,
      Buffer.alloc(0),
    );
  }

  async listChildren(
    accessToken: string,
    folderId: string,
  ): Promise<DriveFile[]> {
    this.lastAccessToken = accessToken;
    return [...this.files.values()]
      .filter((f) => f.parentId === folderId && !f.trashed)
      .map((f) => ({ ...f }));
  }

  async getFile(accessToken: string, fileId: string): Promise<DriveFileResult> {
    this.lastAccessToken = accessToken;
    return this.result(fileId);
  }

  async rename(
    accessToken: string,
    fileId: string,
    name: string,
  ): Promise<DriveFileResult> {
    this.lastAccessToken = accessToken;
    return this.mutate(fileId, (f) => void (f.name = name));
  }

  async move(
    accessToken: string,
    fileId: string,
    newParentId: string,
  ): Promise<DriveFileResult> {
    this.lastAccessToken = accessToken;
    return this.mutate(fileId, (f) => void (f.parentId = newParentId));
  }

  async trash(accessToken: string, fileId: string): Promise<DriveFileResult> {
    this.lastAccessToken = accessToken;
    return this.mutate(fileId, (f) => void (f.trashed = true));
  }

  async startResumableUpload(
    accessToken: string,
    input: StartUploadInput,
  ): Promise<{ sessionUri: string }> {
    this.lastAccessToken = accessToken;
    const sessionUri = `https://fake-upload.googleapis.test/session/${++this.sessionCounter}`;
    this.sessions.set(sessionUri, {
      input,
      received: [],
      receivedBytes: 0,
      fileId: null,
      interruptAfterBytes: null,
    });
    return { sessionUri };
  }

  async uploadChunk(
    accessToken: string,
    sessionUri: string,
    chunk: UploadChunkInput,
  ): Promise<UploadChunkResult> {
    this.lastAccessToken = accessToken;
    const s = this.sessions.get(sessionUri);
    if (!s) return { status: "session-not-found" };
    if (s.fileId) return { status: "complete", file: this.mustGet(s.fileId) };
    if (chunk.start !== s.receivedBytes) {
      return { status: "offset-mismatch", receivedBytes: s.receivedBytes };
    }
    if (s.interruptAfterBytes !== null) {
      const keep = Math.min(s.interruptAfterBytes, chunk.data.length);
      s.interruptAfterBytes = null;
      s.received.push(chunk.data.subarray(0, keep));
      s.receivedBytes += keep;
      throw new Error("Fake Drive: connection interrupted mid-chunk");
    }
    s.received.push(chunk.data);
    s.receivedBytes += chunk.data.length;
    if (s.receivedBytes < s.input.totalSize) {
      return { status: "incomplete", receivedBytes: s.receivedBytes };
    }
    const file = this.insert(
      s.input.name,
      s.input.mimeType,
      s.input.parentId,
      Buffer.concat(s.received),
    );
    s.fileId = file.id;
    return { status: "complete", file };
  }

  async getUploadStatus(
    accessToken: string,
    sessionUri: string,
  ): Promise<UploadStatusResult> {
    this.lastAccessToken = accessToken;
    const s = this.sessions.get(sessionUri);
    if (!s) return { status: "session-not-found" };
    if (s.fileId) return { status: "complete", file: this.mustGet(s.fileId) };
    return { status: "incomplete", receivedBytes: s.receivedBytes };
  }

  async getStartPageToken(accessToken: string): Promise<string> {
    this.lastAccessToken = accessToken;
    return String(this.changeLog.length);
  }

  async getChanges(
    accessToken: string,
    pageToken: string,
  ): Promise<DriveChangesResult> {
    this.lastAccessToken = accessToken;
    const from = Number.parseInt(pageToken, 10);
    const start = Number.isNaN(from) ? 0 : from;
    const latest = new Map<string, DriveChange>();
    for (const c of this.changeLog.slice(start)) latest.set(c.fileId, c);
    return {
      changes: [...latest.values()].map((c) => ({ ...c })),
      newStartPageToken: String(this.changeLog.length),
    };
  }

  async download(
    accessToken: string,
    fileId: string,
  ): Promise<DriveDownloadResult> {
    this.lastAccessToken = accessToken;
    const f = this.files.get(fileId);
    const data = this.contents.get(fileId);
    if (!f || !data || f.mimeType === DRIVE_FOLDER_MIME)
      return { status: "not-found" };
    return {
      status: "ok",
      stream: Readable.from([data]),
      size: data.length,
      name: f.name,
    };
  }

  async getThumbnail(
    accessToken: string,
    fileId: string,
  ): Promise<DriveDownloadResult> {
    this.lastAccessToken = accessToken;
    const f = this.files.get(fileId);
    if (!f || f.thumbnailLink === null) return { status: "not-found" };
    const svg = Buffer.from(placeholderSvg(f.name));
    return {
      status: "ok",
      stream: Readable.from([svg]),
      size: svg.length,
      name: f.name,
    };
  }

  // ---- test controls ----

  /** Access token passed to the most recent adapter call. */
  lastAccessToken: string | null = null;

  /** Seeds a folder (no change-log entry is skipped; seeding is logged like any create). */
  seedFolder(name: string, parentId: string = FAKE_DRIVE_ROOT_ID): DriveFile {
    return this.insert(name, DRIVE_FOLDER_MIME, parentId, Buffer.alloc(0));
  }

  seedFile(
    name: string,
    parentId: string,
    content: Buffer | string = "",
    mimeType = "application/octet-stream",
  ): DriveFile {
    return this.insert(name, mimeType, parentId, Buffer.from(content));
  }

  /** Simulates someone adding a file to a folder in the Drive UI. */
  externalAddFile(
    name: string,
    parentId: string,
    content: Buffer | string = "",
    mimeType = "application/octet-stream",
  ): DriveFile {
    return this.insert(name, mimeType, parentId, Buffer.from(content));
  }

  /** Simulates someone renaming in the Drive UI. */
  externalRename(fileId: string, name: string): void {
    void this.mutate(fileId, (f) => void (f.name = name));
  }

  externalMove(fileId: string, newParentId: string): void {
    void this.mutate(fileId, (f) => void (f.parentId = newParentId));
  }

  externalTrash(fileId: string): void {
    void this.mutate(fileId, (f) => void (f.trashed = true));
  }

  /** Permanent delete: later getFile returns not-found and the change log marks it removed. */
  externalDelete(fileId: string): void {
    if (!this.files.delete(fileId)) return;
    this.contents.delete(fileId);
    this.changeLog.push({ fileId, removed: true });
  }

  /** The next chunk on this session keeps `acceptBytes` bytes then throws. */
  interruptUpload(sessionUri: string, acceptBytes = 0): void {
    const s = this.sessions.get(sessionUri);
    if (s) s.interruptAfterBytes = acceptBytes;
  }

  /** Drops a session as if it expired. */
  expireSession(sessionUri: string): void {
    this.sessions.delete(sessionUri);
  }

  getContent(fileId: string): Buffer | undefined {
    return this.contents.get(fileId);
  }

  allFiles(): DriveFile[] {
    return [...this.files.values()].map((f) => ({ ...f }));
  }

  reset(): void {
    this.files.clear();
    this.contents.clear();
    this.sessions.clear();
    this.changeLog = [];
    this.idCounter = 0;
    this.sessionCounter = 0;
    this.clock = 0;
    this.lastAccessToken = null;
    this.files.set(FAKE_DRIVE_ROOT_ID, {
      id: FAKE_DRIVE_ROOT_ID,
      name: "My Drive",
      mimeType: DRIVE_FOLDER_MIME,
      parentId: null,
      trashed: false,
      size: 0,
      modifiedTime: this.now(),
      createdTime: this.now(),
      md5Checksum: null,
      thumbnailLink: null,
    });
  }

  // ---- internals ----

  private now(): string {
    return new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000).toISOString();
  }

  private insert(
    name: string,
    mimeType: string,
    parentId: string,
    data: Buffer,
  ): DriveFile {
    const isFolder = mimeType === DRIVE_FOLDER_MIME;
    const createdTime = this.now();
    const file: DriveFile = {
      id: `fake-drive-${++this.idCounter}`,
      name,
      mimeType,
      parentId,
      trashed: false,
      size: data.length,
      modifiedTime: createdTime,
      createdTime,
      md5Checksum: isFolder
        ? null
        : createHash("md5").update(data).digest("hex"),
      thumbnailLink: isFolder
        ? null
        : `https://fake-drive.googleusercontent.test/thumb/${this.idCounter}=s220`,
    };
    this.files.set(file.id, file);
    this.contents.set(file.id, data);
    this.changeLog.push({ fileId: file.id, removed: false, file: { ...file } });
    return { ...file };
  }

  private mutate(fileId: string, fn: (f: DriveFile) => void): DriveFileResult {
    const f = this.files.get(fileId);
    if (!f) return { status: "not-found" };
    fn(f);
    f.modifiedTime = this.now();
    this.changeLog.push({ fileId, removed: false, file: { ...f } });
    return { status: "ok", file: { ...f } };
  }

  private result(fileId: string): DriveFileResult {
    const f = this.files.get(fileId);
    return f ? { status: "ok", file: { ...f } } : { status: "not-found" };
  }

  private mustGet(fileId: string): DriveFile {
    const f = this.files.get(fileId);
    if (!f) throw new Error(`Fake Drive: missing file ${fileId}`);
    return { ...f };
  }
}

function placeholderSvg(name: string): string {
  const label = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#d9d9d9"/><text x="200" y="155" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#444">${label}</text></svg>`;
}
