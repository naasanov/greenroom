import type { ZodType } from "zod";

/** Resolves the API origin in the browser; `NEXT_PUBLIC_API_URL` wins when set. */
export function getApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") {
    throw new Error("The API URL can only be resolved in the browser");
  }
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const webPort = Number(port || (protocol === "https:" ? 443 : 80));
    return `${protocol}//${hostname}:${webPort + 1000}`;
  }
  return `https://api.${hostname}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Parses the JSON response; omit for 204 responses. */
  schema?: ZodType<T>;
}

/** Typed fetch against the API with the session cookie attached. */
export async function api<T = void>(
  path: string,
  { method = "GET", body, schema }: RequestOptions<T> = {},
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let code: string | undefined;
    try {
      const data = (await res.json()) as { message?: unknown; code?: unknown };
      if (typeof data.message === "string") message = data.message;
      if (typeof data.code === "string") code = data.code;
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(res.status, message, code);
  }
  if (!schema) return undefined as T;
  return schema.parse(await res.json());
}
