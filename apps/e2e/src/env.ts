/**
 * Playwright sets TEST_PARALLEL_INDEX in each worker process (unset in the runner),
 * so these constants resolve per worker: worker N owns ports 3100+N / 4100+N and its own DB.
 */
export const WORKER_INDEX = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
export const API_PORT = 4100 + WORKER_INDEX;
export const WEB_PORT = 3100 + WORKER_INDEX;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** Admin database URL: global setup migrates it and workers clone their own from it. */
export const BASE_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://greenroom:greenroom@localhost:5432/greenroom_test";

/** Worker 0 uses the base database; worker N uses `<base>_wN`. */
export function databaseUrlFor(index: number): string {
  if (index === 0) return BASE_DATABASE_URL;
  const url = new URL(BASE_DATABASE_URL);
  url.pathname = `${url.pathname}_w${index}`;
  return url.toString();
}

export const TEST_DATABASE_URL = databaseUrlFor(WORKER_INDEX);

/** Number of Playwright workers: `E2E_WORKERS`, default 1. */
export const E2E_WORKERS = Math.max(1, Number(process.env.E2E_WORKERS ?? 1));
