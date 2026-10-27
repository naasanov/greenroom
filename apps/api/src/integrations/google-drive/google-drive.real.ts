import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { auth as googleAuth, drive, type drive_v3 } from "@googleapis/drive";
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
import {
  DRIVE_FILE_FIELDS,
  chunkContentRange,
  escapeDriveQuery,
  mapDriveFile,
  parseReceivedBytes,
  thumbnailUrl,
} from "./google-drive.mapping.js";

const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const UPLOAD_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 1000;

function httpStatus(err: unknown): number | undefined {
  const e = err as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };
  for (const v of [e?.response?.status, e?.status, e?.code]) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isInteger(n)) return n;
  }
  return undefined;
}

function isNotFound(err: unknown): boolean {
  return httpStatus(err) === 404;
}

function driveFor(accessToken: string): drive_v3.Drive {
  const auth = new googleAuth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return drive({ version: "v3", auth });
}

/** Talks to Drive v3 with the caller's access token; resumable uploads use raw fetch. */
export class RealGoogleDriveAdapter implements GoogleDriveAdapter {
  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string },
  ): Promise<DriveFile> {
    const res = await driveFor(accessToken).files.create({
      requestBody: {
        name: input.name,
        mimeType: DRIVE_FOLDER_MIME,
        parents: [input.parentId],
      },
      fields: DRIVE_FILE_FIELDS,
      supportsAllDrives: true,
    });
    return mapDriveFile(res.data);
  }

  async listChildren(
    accessToken: string,
    folderId: string,
  ): Promise<DriveFile[]> {
    const drive = driveFor(accessToken);
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
        fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
        pageSize: PAGE_SIZE,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) out.push(mapDriveFile(f));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async getFile(accessToken: string, fileId: string): Promise<DriveFileResult> {
    try {
      const res = await driveFor(accessToken).files.get({
        fileId,
        fields: DRIVE_FILE_FIELDS,
        supportsAllDrives: true,
      });
      return { status: "ok", file: mapDriveFile(res.data) };
    } catch (err) {
      if (isNotFound(err)) return { status: "not-found" };
      throw err;
    }
  }

  async rename(
    accessToken: string,
    fileId: string,
    name: string,
  ): Promise<DriveFileResult> {
    return this.update(accessToken, fileId, { requestBody: { name } });
  }

  async move(
    accessToken: string,
    fileId: string,
    newParentId: string,
  ): Promise<DriveFileResult> {
    const current = await driveFor(accessToken)
      .files.get({ fileId, fields: "parents", supportsAllDrives: true })
      .then(
        (r) => r.data.parents ?? [],
        (err: unknown) => {
          if (isNotFound(err)) return null;
          throw err;
        },
      );
    if (current === null) return { status: "not-found" };
    const remove = current.filter((p) => p !== newParentId);
    return this.update(accessToken, fileId, {
      addParents: current.includes(newParentId) ? undefined : newParentId,
      removeParents: remove.length > 0 ? remove.join(",") : undefined,
    });
  }

  async trash(accessToken: string, fileId: string): Promise<DriveFileResult> {
    return this.update(accessToken, fileId, { requestBody: { trashed: true } });
  }

  async startResumableUpload(
    accessToken: string,
    input: StartUploadInput,
  ): Promise<{ sessionUri: string }> {
    const url = `${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.totalSize),
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
      }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    const sessionUri = res.headers.get("location");
    if (!res.ok || !sessionUri) {
      throw new Error(`Drive resumable start failed with status ${res.status}`);
    }
    return { sessionUri };
  }

  async uploadChunk(
    accessToken: string,
    sessionUri: string,
    chunk: UploadChunkInput,
  ): Promise<UploadChunkResult> {
    const res = await this.putSession(
      accessToken,
      sessionUri,
      chunkContentRange(chunk.start, chunk.end, chunk.total),
      chunk.data,
    );
    if (res.status === 308) {
      const receivedBytes = parseReceivedBytes(res.headers.get("range"));
      // Anything other than exactly end + 1 means the server is at a different offset.
      return receivedBytes === chunk.end + 1
        ? { status: "incomplete", receivedBytes }
        : { status: "offset-mismatch", receivedBytes };
    }
    return this.finish(res, "uploadChunk");
  }

  async getUploadStatus(
    accessToken: string,
    sessionUri: string,
    totalSize?: number,
  ): Promise<UploadStatusResult> {
    const res = await this.putSession(
      accessToken,
      sessionUri,
      `bytes */${totalSize ?? "*"}`,
      undefined,
    );
    if (res.status === 308) {
      return {
        status: "incomplete",
        receivedBytes: parseReceivedBytes(res.headers.get("range")),
      };
    }
    return this.finish(res, "getUploadStatus");
  }

  async getStartPageToken(accessToken: string): Promise<string> {
    const res = await driveFor(accessToken).changes.getStartPageToken({
      supportsAllDrives: true,
    });
    if (!res.data.startPageToken) {
      throw new Error("Drive returned no startPageToken");
    }
    return res.data.startPageToken;
  }

  async getChanges(
    accessToken: string,
    pageToken: string,
  ): Promise<DriveChangesResult> {
    const drive = driveFor(accessToken);
    const latest = new Map<string, DriveChange>();
    let token: string | undefined = pageToken;
    let newStartPageToken: string | undefined;
    while (token) {
      const res: { data: drive_v3.Schema$ChangeList } =
        await drive.changes.list({
          pageToken: token,
          includeRemoved: true,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          pageSize: PAGE_SIZE,
          fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${DRIVE_FILE_FIELDS}))`,
        });
      for (const c of res.data.changes ?? []) {
        if (!c.fileId) continue;
        const removed = c.removed ?? false;
        latest.set(c.fileId, {
          fileId: c.fileId,
          removed: removed || !c.file,
          ...(!removed && c.file ? { file: mapDriveFile(c.file) } : {}),
        });
      }
      newStartPageToken = res.data.newStartPageToken ?? newStartPageToken;
      token = res.data.nextPageToken ?? undefined;
    }
    if (!newStartPageToken) throw new Error("Drive returned no new page token");
    return { changes: [...latest.values()], newStartPageToken };
  }

  async download(
    accessToken: string,
    fileId: string,
  ): Promise<DriveDownloadResult> {
    const meta = await this.getFile(accessToken, fileId);
    if (meta.status === "not-found" || meta.file.mimeType === DRIVE_FOLDER_MIME)
      return { status: "not-found" };
    try {
      const res = await driveFor(accessToken).files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "stream" },
      );
      return {
        status: "ok",
        stream: res.data as unknown as Readable,
        size: meta.file.size,
        name: meta.file.name,
      };
    } catch (err) {
      if (isNotFound(err)) return { status: "not-found" };
      throw err;
    }
  }

  async getThumbnail(
    accessToken: string,
    fileId: string,
  ): Promise<DriveDownloadResult> {
    const meta = await this.getFile(accessToken, fileId);
    if (meta.status === "not-found" || !meta.file.thumbnailLink)
      return { status: "not-found" };
    const res = await fetch(thumbnailUrl(meta.file.thumbnailLink), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok || !res.body) {
      throw new Error(`Drive thumbnail failed with status ${res.status}`);
    }
    return {
      status: "ok",
      stream: Readable.fromWeb(res.body as unknown as WebReadableStream),
      size: Number(res.headers.get("content-length") ?? 0),
      name: meta.file.name,
    };
  }

  // ---- internals ----

  private async update(
    accessToken: string,
    fileId: string,
    params: Omit<drive_v3.Params$Resource$Files$Update, "fileId">,
  ): Promise<DriveFileResult> {
    try {
      const res = await driveFor(accessToken).files.update({
        ...params,
        fileId,
        fields: DRIVE_FILE_FIELDS,
        supportsAllDrives: true,
      });
      return { status: "ok", file: mapDriveFile(res.data) };
    } catch (err) {
      if (isNotFound(err)) return { status: "not-found" };
      throw err;
    }
  }

  private putSession(
    accessToken: string,
    sessionUri: string,
    contentRange: string,
    data: Buffer | undefined,
  ): Promise<Response> {
    return fetch(sessionUri, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Range": contentRange,
        "Content-Length": String(data?.length ?? 0),
      },
      body: data ? new Uint8Array(data) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  }

  private async finish(
    res: Response,
    op: string,
  ): Promise<
    { status: "complete"; file: DriveFile } | { status: "session-not-found" }
  > {
    if (res.status === 404 || res.status === 410) {
      return { status: "session-not-found" };
    }
    if (res.status === 200 || res.status === 201) {
      const body = (await res.json()) as drive_v3.Schema$File;
      return { status: "complete", file: mapDriveFile(body) };
    }
    throw new Error(`Drive ${op} failed with status ${res.status}`);
  }
}
