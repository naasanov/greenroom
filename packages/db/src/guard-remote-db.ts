const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Thrown when a mutating db command targets a non-local host without ALLOW_REMOTE_DB=1. */
export class RemoteDatabaseError extends Error {}

/** Host a connection string points at, honoring a `?host=` override; never includes credentials. */
export function databaseHost(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new RemoteDatabaseError(
      "Refusing to run: DATABASE_URL is not a parseable URL, so its host cannot be checked. Set ALLOW_REMOTE_DB=1 to skip this check.",
    );
  }
  const host = url.searchParams.get("host") || url.hostname;
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

/**
 * Throws unless the database host is local or ALLOW_REMOTE_DB=1 is set.
 * The message names the host only, never the password or the full URL.
 */
export function assertLocalDatabase(
  databaseUrl: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.ALLOW_REMOTE_DB === "1") return;
  const host = databaseHost(databaseUrl);
  if (host === "" || LOCAL_HOSTS.has(host)) return;
  throw new RemoteDatabaseError(
    `Refusing to run against non-local database host "${host}". Set ALLOW_REMOTE_DB=1 to proceed.`,
  );
}

/** CLI wrapper: prints the refusal to stderr and exits 1 instead of throwing. */
export function guardRemoteDbOrExit(databaseUrl: string): void {
  try {
    assertLocalDatabase(databaseUrl);
  } catch (err) {
    if (!(err instanceof RemoteDatabaseError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
