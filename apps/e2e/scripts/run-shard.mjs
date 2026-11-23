#!/usr/bin/env node
// Prints the spec file filters for one shard, space separated, for use as playwright args.
//   run-shard.mjs --project=desktop --shard=2/3   -> "tests/a.spec.ts tests/b.spec.ts ..."
//   run-shard.mjs --project=desktop --quarantined=files|grep  -> quarantined spec files, or a title regex
//   run-shard.mjs --verify                        -> exits 1 unless every project's shards cover all specs once
import console from "node:console";
import process from "node:process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  E2E_DIR,
  listSpecs,
  loadPlan,
  loadQuarantine,
  quarantineFiles,
  quarantineGrep,
  resolveShards,
} from "./shard-lib.mjs";

const flag = (name) =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")[1];
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const plan = loadPlan();
const specs = process.env.E2E_SPEC_LIST
  ? process.env.E2E_SPEC_LIST.split(",")
  : listSpecs();

if (process.argv.includes("--verify")) {
  let bad = false;
  for (const [project, planned] of Object.entries(plan.projects)) {
    const shards = resolveShards(plan, project, specs);
    const seen = new Map();
    shards.forEach((files, i) =>
      files.forEach((f) => seen.set(f, [...(seen.get(f) ?? []), i + 1])),
    );
    const missing = specs.filter((s) => !seen.has(s));
    const dupes = [...seen].filter(([, v]) => v.length > 1).map(([f]) => f);
    const stale = planned.flat().filter((f) => !specs.includes(f));
    const unplanned = specs.filter((s) => !planned.flat().includes(s));
    if (missing.length || dupes.length) bad = true;
    console.log(
      `${project}: ${shards.length} shards, ${seen.size}/${specs.length} specs covered, ${stale.length} stale, ${unplanned.length} unplanned (auto-assigned)`,
    );
    if (missing.length) console.error(`  missing: ${missing.join(" ")}`);
    if (dupes.length) console.error(`  duplicated: ${dupes.join(" ")}`);
  }
  const quarantine = loadQuarantine();
  for (const [project, entries] of Object.entries(quarantine)) {
    for (const { file, title } of entries) {
      const covered = (plan.projects[project] ?? []).flat().includes(file);
      const present =
        specs.includes(file) &&
        readFileSync(join(E2E_DIR, "tests", file), "utf8").includes(title);
      if (!covered || !present) {
        bad = true;
        console.error(`stale quarantine entry: ${project} ${file} "${title}"`);
      }
    }
    console.log(
      `${project}: ${entries.length} quarantined tests (still run in the blocking job minus their titles, and in the quarantine job)`,
    );
  }
  process.exit(bad ? 1 : 0);
}

const project = flag("project");
const quarantined = flag("quarantined");
if (project && quarantined) {
  const entries = loadQuarantine()[project] ?? [];
  if (quarantined === "files")
    console.log(
      quarantineFiles(entries)
        .map((f) => `tests/${f}`)
        .join(" "),
    );
  else if (quarantined === "grep") console.log(quarantineGrep(entries));
  else fail("--quarantined expects files or grep");
  process.exit(0);
}
const m = /^(\d+)\/(\d+)$/.exec(flag("shard") ?? "");
if (!project || !m)
  fail(
    "usage: run-shard.mjs --project=<name> --shard=<i>/<n> | --project=<name> --quarantined=files|grep | --verify",
  );
const [i, n] = [Number(m[1]), Number(m[2])];
const shards = resolveShards(plan, project, specs);
if (shards.length !== n)
  fail(
    `plan has ${shards.length} shards for ${project}, requested ${n}; regenerate shard-plan.json`,
  );
if (i < 1 || i > n) fail(`shard index ${i} out of range 1..${n}`);
console.log(shards[i - 1].map((f) => `tests/${f}`).join(" "));
