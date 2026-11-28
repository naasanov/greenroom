/** Statuses worth another attempt: rate limiting and transient upstream errors. */
export const DEFAULT_RETRY_STATUSES: readonly number[] = [
  429, 500, 502, 503, 504,
];

export interface HttpOptions {
  /** Per-attempt timeout; each attempt gets a fresh AbortSignal. */
  timeoutMs: number;
  /** Retries after the first attempt, shared across all retryable statuses. Default 0. */
  maxRetries?: number;
  retryStatuses?: readonly number[];
  /** Base wait when Retry-After is absent or unusable; doubles per retry. Default 1000. */
  fallbackDelayMs?: number;
  /** Upper bound for any single wait, including a server-provided Retry-After. Default 5000. */
  maxDelayMs?: number;
  /** Reads Retry-After as a bare Number(): a missing or empty header waits 0, a non-numeric one uses the fallback. */
  numericRetryAfter?: boolean;
  /** Runs on the first 401, then the request is retried once without a wait or a retry charge. */
  onUnauthorized?: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type HttpInit = RequestInit | (() => RequestInit | Promise<RequestInit>);

const sleepFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds from a Retry-After value in delta-seconds or HTTP-date form; undefined when unusable. */
export function parseRetryAfterSeconds(
  raw: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const seconds = /^\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds)) return undefined;
  return Math.max(0, seconds);
}

/**
 * fetch with a per-attempt timeout and bounded retries. Waits honor Retry-After,
 * else back off exponentially from fallbackDelayMs, and never exceed maxDelayMs.
 * Network errors and timeouts propagate without a retry.
 */
export async function httpRequest(
  url: string,
  init: HttpInit,
  opts: HttpOptions,
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 0;
  const retryStatuses = opts.retryStatuses ?? DEFAULT_RETRY_STATUSES;
  const fallbackDelayMs = opts.fallbackDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 5000;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? sleepFor;
  const now = opts.now ?? Date.now;
  let retries = 0;
  let reauthed = false;
  for (;;) {
    const base = typeof init === "function" ? await init() : init;
    const res = await doFetch(url, {
      ...base,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (res.status === 401 && opts.onUnauthorized && !reauthed) {
      reauthed = true;
      await discard(res);
      await opts.onUnauthorized();
      continue;
    }
    if (!retryStatuses.includes(res.status) || retries >= maxRetries) {
      return res;
    }
    const rawRetryAfter = res.headers.get("retry-after");
    const numeric = Number(rawRetryAfter);
    const serverSeconds = opts.numericRetryAfter
      ? Number.isFinite(numeric)
        ? numeric
        : undefined
      : parseRetryAfterSeconds(rawRetryAfter, now());
    const wait =
      serverSeconds !== undefined
        ? serverSeconds * 1000
        : fallbackDelayMs * 2 ** retries;
    retries++;
    await discard(res);
    await sleep(Math.min(maxDelayMs, Math.max(0, wait)));
  }
}

/** Up to maxChars of the response body, or "" when it cannot be read. */
export async function bodySnippet(
  res: Response,
  maxChars: number,
): Promise<string> {
  try {
    return (await res.text()).slice(0, maxChars);
  } catch {
    return "";
  }
}

/** Reads a bounded body snippet and builds the Error for a failed response. */
export async function httpFailure(
  res: Response,
  maxChars: number,
  message: (detail: string) => string,
): Promise<Error> {
  return new Error(message(await bodySnippet(res, maxChars)));
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // The connection is released best-effort.
  }
}
