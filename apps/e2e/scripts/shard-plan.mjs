#!/usr/bin/env node
// Builds apps/e2e/shard-plan.json from Playwright JSON reports (files, dirs or timings-* globs).
// Usage: node shard-plan.mjs <report|dir>... [--shards desktop=3,mobile=4] [--check] [--out file]
import console from "node:console";
import process from "node:process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  PLAN_PATH,
  WORKERS,
  loadPlan,
  median,
  pack,
  predict,
} from "./shard-lib.mjs";

const args = process.argv.slice(2);
const inputs = [];
let shardSpec = "desktop=3,mobile=4";
let check = false;
let out = PLAN_PATH;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--check") check = true;
  else if (a === "--shards") shardSpec = args[++i];
  else if (a.startsWith("--shards=")) shardSpec = a.slice(9);
  else if (a === "--out") out = resolve(args[++i]);
  else inputs.push(a);
}

function expand(input) {
  if (!input.includes("*")) return [input];
  const dir = resolve(dirname(input));
  const re = new RegExp(
    `^${basename(input)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")}$`,
  );
  return readdirSync(dir)
    .filter((n) => re.test(n))
    .map((n) => join(dir, n));
}

function jsonFiles(p) {
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
    const full = join(p, e.name);
    if (e.isDirectory()) return jsonFiles(full);
    return e.name.endsWith(".json") ? [full] : [];
  });
}

function walk(suite, file, acc) {
  const f = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const ms = (t.results ?? []).reduce((a, r) => a + (r.duration ?? 0), 0);
      const key = (spec.file ?? f).replace(/^.*tests\//, "");
      const proj = (acc[t.projectName] ??= {});
      proj[key] = (proj[key] ?? 0) + ms / 1000;
    }
  }
  for (const s of suite.suites ?? []) walk(s, f, acc);
}

function usage(msg) {
  console.error(msg);
  process.exit(1);
}

const wanted = Object.fromEntries(
  shardSpec.split(",").map((kv) => {
    const [k, v] = kv.split("=");
    return [k, Number(v)];
  }),
);

if (inputs.length === 0 && !check)
  usage(
    "usage: shard-plan.mjs <report|dir>... [--shards desktop=3,mobile=4] [--check]",
  );

let plan;
if (inputs.length === 0) {
  plan = loadPlan();
} else {
  const files = inputs.flatMap(expand).flatMap(jsonFiles).sort();
  if (files.length === 0) usage("no reports found");
  const acc = {};
  for (const f of files)
    walk({ suites: JSON.parse(readFileSync(f, "utf8")).suites ?? [] }, "", acc);
  const seconds = {};
  const projects = {};
  for (const [proj, n] of Object.entries(wanted)) {
    const secs = acc[proj];
    if (!secs) usage(`no timings for project "${proj}"`);
    seconds[proj] = Object.fromEntries(
      Object.keys(secs)
        .sort()
        .map((k) => [k, Math.round(secs[k] * 10) / 10]),
    );
    projects[proj] = pack(seconds[proj], n);
  }
  plan = {
    generatedFrom: files.map((f) => basename(dirname(f)) + "/" + basename(f)),
    projects,
    seconds,
  };
  if (!check) {
    writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
    console.log(`wrote ${out}`);
  }
}

if (check) {
  for (const [proj, shards] of Object.entries(plan.projects)) {
    const secs = plan.seconds[proj];
    const total = Object.values(secs).reduce((a, b) => a + b, 0);
    const maxFile = Math.max(...Object.values(secs));
    const ideal = Math.max(total / shards.length / WORKERS, maxFile);
    const pred = shards.map((s) => predict(s, secs));
    const max = Math.max(...pred);
    console.log(
      `${proj}: ${Object.keys(secs).length} files, total ${total.toFixed(0)}s, median file ${median(Object.values(secs)).toFixed(1)}s, longest ${maxFile.toFixed(0)}s`,
    );
    pred.forEach((p, i) =>
      console.log(
        `  shard ${i + 1}/${shards.length}: ${shards[i].length} files, ~${p.toFixed(0)}s`,
      ),
    );
    console.log(
      `  max ${max.toFixed(0)}s, min ${Math.min(...pred).toFixed(0)}s, spread ${(max - Math.min(...pred)).toFixed(0)}s, ideal ${ideal.toFixed(0)}s (max is ${((max / ideal - 1) * 100).toFixed(1)}% over)`,
    );
  }
}
