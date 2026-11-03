import { spawn, type ChildProcess } from "node:child_process";
import { createDb, runMigrations } from "@greenroom/db";
import {
  API_PORT,
  API_URL,
  BASE_DATABASE_URL,
  TEST_DATABASE_URL,
  WEB_PORT,
  WEB_URL,
  WORKER_INDEX,
} from "./env.js";

/** Creates and migrates this worker's database; worker 0 uses the base DB migrated by global setup. */
async function prepareDatabase(): Promise<void> {
  if (WORKER_INDEX > 0) {
    const admin = createDb(BASE_DATABASE_URL, { max: 1 });
    const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
    const rows =
      await admin.client`select 1 from pg_database where datname = ${name}`;
    if (rows.length === 0)
      await admin.client.unsafe(`create database "${name}"`);
    await admin.close();
    await runMigrations(TEST_DATABASE_URL);
  }
}

function start(
  args: string[],
  cwd: string,
  env: Record<string, string>,
): ChildProcess {
  return spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "ignore",
    detached: true,
  });
}

async function waitFor(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Server for ${url} exited early`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  process.kill(-child.pid, "SIGTERM");
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      // already gone
    }
  }, 5_000);
  await exited;
  clearTimeout(timer);
}

/** Starts this worker's API and web servers against its own database; returns a stopper. */
export async function startWorkerServers(): Promise<() => Promise<void>> {
  await prepareDatabase();
  const api = start(["dist/main.js"], "../api", {
    API_PORT: String(API_PORT),
    DATABASE_URL: TEST_DATABASE_URL,
    INTEGRATIONS_MODE: "fake",
    NODE_ENV: "test",
    WEB_URL,
    WEB_ORIGIN: WEB_URL,
    API_PUBLIC_URL: API_URL,
    // Fixed 32-byte test key (base64); never used outside e2e.
    OAUTH_TOKEN_KEY: "dGVzdC1vbmx5LW9hdXRoLXRva2VuLWtleS0zMmJ5ISE=",
  });
  const web = start(
    ["node_modules/next/dist/bin/next", "start", "-p", String(WEB_PORT)],
    "../web",
    {},
  );
  const stopAll = async () => {
    await Promise.all([stop(api), stop(web)]);
  };
  try {
    await Promise.all([
      waitFor(`${API_URL}/health`, api),
      waitFor(WEB_URL, web),
    ]);
  } catch (e) {
    await stopAll();
    throw e;
  }
  return stopAll;
}
