import type { QueryClient } from "@tanstack/react-query";
import {
  UPLOAD_ERROR_CODES,
  type MediaItem,
  type UploadSession,
} from "@greenroom/shared";
import { ApiError } from "@/lib/api";
import { googleKeys } from "@/lib/queries/google";
import {
  bulkPatchUploads,
  cancelUpload,
  memberUploadEndpoints,
  patchUpload,
} from "@/lib/queries/uploads";
import { fileFingerprint, isAbortError, uploadFile } from "@/lib/uploader";

export type EntryStatus = "queued" | "uploading" | "done" | "error" | "readd";

export interface UploadEntry {
  key: string;
  bandId: string;
  gigId: string;
  /** Null after a reload: the browser lost the file, so the user must re-add it. */
  file: File | null;
  fileName: string;
  mimeType: string;
  fingerprint: string;
  totalBytes: number;
  sent: number;
  status: EntryStatus;
  error: string | null;
  retryable: boolean;
  sessionId: string | null;
  folderId: string | null;
  songId: string | null;
  item: MediaItem | null;
  /** Finished in a previous visit rather than in this page's queue. */
  restored: boolean;
  /** Done and animating up into the gallery. */
  flying: boolean;
  /** The user picked a folder (or Unsorted); the entry leaves the tray once done. */
  placed: boolean;
  previewUrl: string | null;
}

interface Patch {
  folderId?: string | null;
  songId?: string | null;
  fileName?: string;
}

const CONCURRENCY = 2;

function describeError(e: unknown): { message: string; retryable: boolean } {
  if (e instanceof ApiError) {
    if (e.code === UPLOAD_ERROR_CODES.typeNotAllowed) {
      return { message: "This file type is not supported", retryable: false };
    }
    if (e.code === UPLOAD_ERROR_CODES.tooLarge) {
      return { message: "This file is too large", retryable: false };
    }
    if (e.code === "GOOGLE_NOT_LINKED") {
      return { message: "Google Drive is not linked", retryable: false };
    }
  }
  if (e instanceof Error && e.message === "This file is empty") {
    return { message: "This file is empty", retryable: false };
  }
  return { message: "Upload failed", retryable: true };
}

/**
 * Upload queue that outlives the gallery route. Entries are immutable
 * snapshots; `subscribe` / `getSnapshot` plug into useSyncExternalStore.
 */
export class UploadStore {
  private entries: UploadEntry[] = [];
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private pending = new Map<string, Patch>();
  /** Session ids that already showed up and left (or were dismissed). */
  private settled = new Set<string>();
  private seq = 0;

  constructor(private readonly qc: QueryClient) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.entries;

  private emit() {
    for (const l of this.listeners) l();
  }

  private update(key: string, fn: (e: UploadEntry) => UploadEntry) {
    this.entries = this.entries.map((e) => (e.key === key ? fn(e) : e));
    this.emit();
  }

  private current(key: string) {
    return this.entries.find((e) => e.key === key);
  }

  private remove(keys: string[]) {
    const gone = new Set(keys);
    for (const e of this.entries) {
      if (!gone.has(e.key)) continue;
      if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
      if (e.sessionId) this.settled.add(e.sessionId);
    }
    this.entries = this.entries.filter((e) => !gone.has(e.key));
    this.emit();
  }

  add(bandId: string, gigId: string, files: File[]) {
    for (const file of files) {
      const fingerprint = fileFingerprint(file);
      const previewUrl =
        file.type.startsWith("image/") || file.type.startsWith("video/")
          ? URL.createObjectURL(file)
          : null;
      const same = this.entries.find(
        (e) => e.gigId === gigId && e.fingerprint === fingerprint,
      );
      if (same && (same.status === "queued" || same.status === "uploading")) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        continue;
      }
      if (same && same.status === "readd") {
        if (same.previewUrl) URL.revokeObjectURL(same.previewUrl);
        this.update(same.key, (e) => ({
          ...e,
          file,
          previewUrl,
          status: "queued",
          error: null,
        }));
        continue;
      }
      const entry: UploadEntry = {
        key: `up-${++this.seq}-${Math.random().toString(36).slice(2, 8)}`,
        bandId,
        gigId,
        file,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fingerprint,
        totalBytes: file.size,
        sent: 0,
        status: "queued",
        error: null,
        retryable: false,
        sessionId: null,
        folderId: null,
        songId: null,
        item: null,
        restored: false,
        flying: false,
        placed: false,
        previewUrl,
      };
      this.entries = [...this.entries, entry];
      this.emit();
    }
    this.pump();
  }

  /** Adds entries for the caller's server sessions that this page does not know yet. */
  restore(bandId: string, gigId: string, sessions: UploadSession[]) {
    const known = (s: UploadSession) =>
      this.settled.has(s.id) ||
      this.entries.some(
        (e) =>
          e.gigId === gigId &&
          (e.sessionId === s.id ||
            (e.sessionId === null && e.fingerprint === s.fingerprint)),
      );
    const fresh = sessions.filter((s) => !known(s));
    const unfinished = fresh.filter(
      (s) => s.status === "pending" || s.status === "uploading",
    );
    if (unfinished.length === 0) return;
    const since =
      Math.min(...unfinished.map((s) => Date.parse(s.createdAt))) - 3600_000;
    const shown = fresh.filter(
      (s) =>
        unfinished.includes(s) ||
        (s.status === "complete" &&
          !!s.item &&
          Date.parse(s.createdAt) >= since),
    );
    const added: UploadEntry[] = shown.map((s) => ({
      key: `up-${++this.seq}-${s.id.slice(0, 6)}`,
      bandId,
      gigId,
      file: null,
      fileName: s.item?.name ?? s.fileName,
      mimeType: s.mimeType ?? "application/octet-stream",
      fingerprint: s.fingerprint,
      totalBytes: s.totalBytes,
      sent: s.status === "complete" ? s.totalBytes : s.bytesReceived,
      status: s.status === "complete" ? "done" : "readd",
      error: null,
      retryable: false,
      sessionId: s.id,
      folderId: s.folderId,
      songId: s.songId,
      item: s.item,
      restored: true,
      flying: false,
      placed: false,
      previewUrl: null,
    }));
    this.entries = [...this.entries, ...added];
    this.emit();
  }

  /** Edits folder / song / name locally and on the session; unfinished entries only. */
  patch(keys: string[], patch: Patch) {
    const targets = this.entries.filter(
      (e) => keys.includes(e.key) && e.status !== "done",
    );
    if (targets.length === 0) return;
    this.entries = this.entries.map((e) =>
      targets.some((t) => t.key === e.key)
        ? {
            ...e,
            ...(patch.folderId !== undefined
              ? { folderId: patch.folderId, placed: true }
              : {}),
            ...(patch.songId !== undefined ? { songId: patch.songId } : {}),
            ...(patch.fileName !== undefined
              ? { fileName: patch.fileName }
              : {}),
          }
        : e,
    );
    this.emit();
    const withSession = targets.filter((t) => t.sessionId);
    for (const t of targets) {
      if (!t.sessionId) {
        this.pending.set(t.key, { ...this.pending.get(t.key), ...patch });
      }
    }
    if (withSession.length === 0) return;
    const bandId = withSession[0]!.bandId;
    const { fileName, ...bulk } = patch;
    if (fileName !== undefined) {
      for (const t of withSession) {
        void patchUpload(t.bandId, t.sessionId!, { fileName }).catch(() => {});
      }
    }
    if (bulk.folderId !== undefined || bulk.songId !== undefined) {
      void bulkPatchUploads(bandId, {
        ids: withSession.map((t) => t.sessionId!),
        ...bulk,
      }).catch(() => {});
    }
  }

  cancel(keys: string[]) {
    const targets = this.entries.filter((e) => keys.includes(e.key));
    for (const t of targets) {
      if (t.status === "done") continue;
      this.controllers.get(t.key)?.abort();
      this.controllers.delete(t.key);
      if (t.sessionId) {
        void cancelUpload(t.bandId, t.sessionId).catch(() => {});
      }
      this.pending.delete(t.key);
      this.remove([t.key]);
      // A cancel before the session exists is cleaned up in `run`.
      this.cancelled.add(t.key);
    }
    this.pump();
  }

  private cancelled = new Set<string>();

  /** Local-only edit of finished entries (the caller updates the media items). */
  patchDone(keys: string[], patch: Patch) {
    this.entries = this.entries.map((e) =>
      keys.includes(e.key) && e.status === "done"
        ? {
            ...e,
            ...(patch.songId !== undefined ? { songId: patch.songId } : {}),
            ...(patch.fileName !== undefined
              ? { fileName: patch.fileName }
              : {}),
          }
        : e,
    );
    this.emit();
  }

  /** Removes finished entries from the tray without touching the server. */
  dismiss(keys: string[]) {
    this.remove(
      this.entries
        .filter((e) => keys.includes(e.key) && e.status === "done")
        .map((e) => e.key),
    );
  }

  retry(key: string) {
    this.update(key, (e) => ({ ...e, status: "queued", error: null }));
    this.pump();
  }

  private pump() {
    while (this.controllers.size < CONCURRENCY) {
      const next = this.entries.find(
        (e) => e.status === "queued" && !this.controllers.has(e.key) && e.file,
      );
      if (!next) return;
      void this.run(next);
    }
  }

  private async run(entry: UploadEntry) {
    const key = entry.key;
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.update(key, (e) => ({ ...e, status: "uploading", error: null }));
    const endpoints = memberUploadEndpoints(entry.bandId, entry.gigId, () => {
      const e = this.current(key);
      return { folderId: e?.folderId ?? null, songId: e?.songId ?? null };
    });
    try {
      const session = await uploadFile(entry.file!, endpoints, {
        signal: controller.signal,
        onSession: (s) => {
          if (this.cancelled.has(key)) {
            void cancelUpload(entry.bandId, s.id).catch(() => {});
            return;
          }
          const queued = this.pending.get(key);
          if (queued && this.current(key)?.sessionId == null) {
            this.pending.delete(key);
            void patchUpload(entry.bandId, s.id, queued).catch(() => {});
          }
          this.update(key, (e) => ({
            ...e,
            sessionId: s.id,
            sent: s.status === "complete" ? e.totalBytes : s.bytesReceived,
          }));
        },
        onProgress: (sent) => this.update(key, (e) => ({ ...e, sent })),
      });
      this.update(key, (e) => ({
        ...e,
        status: "done",
        sent: e.totalBytes,
        item: session.item,
        fileName: session.item?.name ?? e.fileName,
      }));
      void this.qc.invalidateQueries({
        queryKey: googleKeys.media(entry.bandId),
      });
      void this.qc.invalidateQueries({
        queryKey: ["bands", entry.bandId, "song-media"],
      });
      // Finished files stay in the tray until the user places them. Placed ones
      // render in their gallery folder and are dismissed once the item lands.
    } catch (e) {
      if (isAbortError(e) || this.cancelled.has(key)) {
        // Cancelled by the user; the entry is already gone.
      } else if (
        e instanceof ApiError &&
        e.code === UPLOAD_ERROR_CODES.notActive
      ) {
        this.remove([key]);
      } else {
        const { message, retryable } = describeError(e);
        this.update(key, (x) => ({
          ...x,
          status: "error",
          error: message,
          retryable,
        }));
      }
    } finally {
      this.controllers.delete(key);
      this.pump();
    }
  }
}
