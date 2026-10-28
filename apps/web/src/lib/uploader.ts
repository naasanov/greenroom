import { UPLOAD_ERROR_CODES, type UploadSession } from "@greenroom/shared";
import { ApiError, getApiUrl } from "@/lib/api";

/** The two calls the engine needs; implementations translate HTTP errors into the error classes below. */
export interface UploadEndpoints {
  create(input: {
    fileName: string;
    mimeType: string;
    totalBytes: number;
    fingerprint: string;
  }): Promise<UploadSession>;
  chunk(
    sessionId: string,
    start: number,
    endInclusive: number,
    total: number,
    body: Blob,
    signal?: AbortSignal,
  ): Promise<UploadSession>;
}

/** The server holds a different offset; continue from `bytesReceived`. */
export class UploadOffsetMismatchError extends Error {
  constructor(public bytesReceived: number) {
    super("Upload offset mismatch");
    this.name = "UploadOffsetMismatchError";
  }
}

/** A transient failure (network, 5xx); retry, from `bytesReceived` when the server reported it. */
export class UploadRetryableError extends Error {
  constructor(public bytesReceived: number | null) {
    super("Upload interrupted");
    this.name = "UploadRetryableError";
  }
}

export const fileFingerprint = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`;

const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function abortError(): Error {
  const e = new Error("Upload aborted");
  e.name = "AbortError";
  return e;
}

export const isAbortError = (e: unknown): boolean =>
  e instanceof Error && e.name === "AbortError";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Uploads one file in sequential chunks of the session's chunk size, resuming
 * from the server's offset and retrying transient failures with backoff.
 * Resolves with the complete session; a complete session on create skips.
 */
export async function uploadFile(
  file: File,
  endpoints: UploadEndpoints,
  opts: {
    signal?: AbortSignal;
    onSession?(s: UploadSession): void;
    onProgress?(sent: number, total: number): void;
    /** Overrides the first retry delay (tests). */
    retryDelayMs?: number;
  } = {},
): Promise<UploadSession> {
  const { signal, onSession, onProgress } = opts;
  if (file.size === 0) throw new Error("This file is empty");
  if (signal?.aborted) throw abortError();

  let session = await endpoints.create({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    totalBytes: file.size,
    fingerprint: fileFingerprint(file),
  });
  onSession?.(session);
  if (signal?.aborted) throw abortError();
  onProgress?.(session.bytesReceived, file.size);

  let offset = session.bytesReceived;
  let failures = 0;
  while (session.status !== "complete") {
    if (signal?.aborted) throw abortError();
    if (offset >= file.size) {
      throw new Error("Upload finished without a result");
    }
    const end = Math.min(offset + session.chunkSize, file.size);
    try {
      session = await endpoints.chunk(
        session.id,
        offset,
        end - 1,
        file.size,
        file.slice(offset, end),
        signal,
      );
      failures = 0;
      offset =
        session.status === "complete" ? file.size : session.bytesReceived;
      onProgress?.(offset, file.size);
      onSession?.(session);
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) throw abortError();
      if (e instanceof UploadOffsetMismatchError) {
        // Seeking is progress; guard only against an endless ping-pong.
        if (++failures > MAX_ATTEMPTS) throw e;
        offset = e.bytesReceived;
        onProgress?.(offset, file.size);
        continue;
      }
      if (e instanceof UploadRetryableError) {
        if (++failures > MAX_ATTEMPTS) throw e;
        if (e.bytesReceived !== null) {
          offset = e.bytesReceived;
          onProgress?.(offset, file.size);
        }
        const base = opts.retryDelayMs ?? BASE_DELAY_MS;
        await sleep(Math.min(base * 2 ** (failures - 1), MAX_DELAY_MS), signal);
        continue;
      }
      throw e;
    }
  }
  return session;
}

interface ErrorBody {
  message?: unknown;
  code?: unknown;
  bytesReceived?: unknown;
}

/**
 * Sends one chunk to `url` (the session endpoint) and maps failures: 409
 * offset mismatch, 502 and network errors become the engine's error classes,
 * everything else an ApiError carrying the API's code.
 */
export async function sendChunk(
  url: string,
  start: number,
  endInclusive: number,
  total: number,
  body: Blob,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<UploadSession> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      method: "PUT",
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${start}-${endInclusive}/${total}`,
      },
      body,
      signal,
    });
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) throw abortError();
    throw new UploadRetryableError(null);
  }
  if (res.ok) return (await res.json()) as UploadSession;
  let data: ErrorBody = {};
  try {
    data = (await res.json()) as ErrorBody;
  } catch {
    // Non-JSON error body.
  }
  const received =
    typeof data.bytesReceived === "number" ? data.bytesReceived : null;
  if (
    res.status === 409 &&
    data.code === UPLOAD_ERROR_CODES.offsetMismatch &&
    received !== null
  ) {
    throw new UploadOffsetMismatchError(received);
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new UploadRetryableError(received);
  }
  throw new ApiError(
    res.status,
    typeof data.message === "string" ? data.message : res.statusText,
    typeof data.code === "string" ? data.code : undefined,
  );
}

export { getApiUrl };
