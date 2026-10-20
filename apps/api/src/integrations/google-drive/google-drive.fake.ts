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

  async createFolder(input: {
    name: string;
    parentId: string;
  }): Promise<DriveFile> {
    return this.insert(
      input.name,
      DRIVE_FOLDER_MIME,
      input.parentId,
      Buffer.alloc(0),
    );
  }

  async listChildren(folderId: string): Promise<DriveFile[]> {
    return [...this.files.values()]
      .filter((f) => f.parentId === folderId && !f.trashed)
      .map((f) => ({ ...f }));
  }

  async getFile(fileId: string): Promise<DriveFileResult> {
    return this.result(fileId);
  }

  async rename(fileId: string, name: string): Promise<DriveFileResult> {
    return this.mutate(fileId, (f) => void (f.name = name));
  }

  async move(fileId: string, newParentId: string): Promise<DriveFileResult> {
    return this.mutate(fileId, (f) => void (f.parentId = newParentId));
  }

  async trash(fileId: string): Promise<DriveFileResult> {
    return this.mutate(fileId, (f) => void (f.trashed = true));
  }

  async startResumableUpload(
    input: StartUploadInput,
  ): Promise<{ sessionUri: string }> {
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
    sessionUri: string,
    chunk: UploadChunkInput,
  ): Promise<UploadChunkResult> {
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

  async getUploadStatus(sessionUri: string): Promise<UploadStatusResult> {
    const s = this.sessions.get(sessionUri);
    if (!s) return { status: "session-not-found" };
    if (s.fileId) return { status: "complete", file: this.mustGet(s.fileId) };
    return { status: "incomplete", receivedBytes: s.receivedBytes };
  }

  async getStartPageToken(): Promise<string> {
    return String(this.changeLog.length);
  }

  async getChanges(pageToken: string): Promise<DriveChangesResult> {
    const from = Number.parseInt(pageToken, 10);
    const start = Number.isNaN(from) ? 0 : from;
    const latest = new Map<string, DriveChange>();
    for (const c of this.changeLog.slice(start)) latest.set(c.fileId, c);
    return {
      changes: [...latest.values()].map((c) => ({ ...c })),
      newStartPageToken: String(this.changeLog.length),
    };
  }

  async download(fileId: string): Promise<DriveDownloadResult> {
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

  // ---- test controls ----

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
    this.files.set(FAKE_DRIVE_ROOT_ID, {
      id: FAKE_DRIVE_ROOT_ID,
      name: "My Drive",
      mimeType: DRIVE_FOLDER_MIME,
      parentId: null,
      trashed: false,
      size: 0,
      modifiedTime: this.now(),
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
    const file: DriveFile = {
      id: `fake-drive-${++this.idCounter}`,
      name,
      mimeType,
      parentId,
      trashed: false,
      size: data.length,
      modifiedTime: this.now(),
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
