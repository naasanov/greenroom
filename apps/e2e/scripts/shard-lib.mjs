import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKERS = 2;
const here = dirname(fileURLToPath(import.meta.url));
export const E2E_DIR = join(here, "..");
export const PLAN_PATH = join(E2E_DIR, "shard-plan.json");

export function listSpecs(dir = join(E2E_DIR, "tests")) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort();
}

export function loadPlan(path = PLAN_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Predicted wall seconds of a shard: even split over workers, floored by the longest file.
export function predict(files, seconds) {
  const times = files.map((f) => seconds[f] ?? 0);
  const sum = times.reduce((a, b) => a + b, 0);
  return Math.max(sum / WORKERS, ...times, 0);
}

// Longest-processing-time-first: each file goes to the currently lightest shard.
export function pack(seconds, n, files = Object.keys(seconds)) {
  const shards = Array.from({ length: n }, () => ({ files: [], load: 0 }));
  const order = [...files].sort(
    (a, b) => seconds[b] - seconds[a] || a.localeCompare(b),
  );
  for (const f of order) {
    const t = shards.reduce((best, s) => (s.load < best.load ? s : best));
    t.files.push(f);
    t.load += seconds[f];
  }
  return shards.map((s) => s.files.sort());
}

// Effective per-project shard contents for the files on disk. Files missing from the plan
// are placed on the lightest shard using the project's median file time.
export function resolveShards(plan, project, specs) {
  const planned = plan.projects?.[project];
  if (!planned)
    throw new Error(`project "${project}" is not in the shard plan`);
  const seconds = plan.seconds[project] ?? {};
  const onDisk = new Set(specs);
  const shards = planned.map((files) => files.filter((f) => onDisk.has(f)));
  const known = new Set(planned.flat());
  const fallback = median(Object.values(seconds));
  const loads = shards.map((files) =>
    files.reduce((a, f) => a + (seconds[f] ?? fallback), 0),
  );
  for (const f of specs.filter((s) => !known.has(s))) {
    let idx = 0;
    for (let i = 1; i < loads.length; i++) if (loads[i] < loads[idx]) idx = i;
    shards[idx].push(f);
    loads[idx] += fallback;
  }
  return shards.map((files) => files.sort());
}
