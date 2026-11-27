#!/usr/bin/env node
// Fails when a branch's drizzle migration journal collides with the base branch's.
// Usage: node scripts/check-migration-journal.mjs [--base <ref>]  (default origin/main)
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JOURNAL_PATH = "packages/db/migrations/meta/_journal.json";

const tagPrefix = (tag) => /^(\d+)_/.exec(tag)?.[1] ?? null;

/**
 * Compares a head journal's entries to the base journal's entries.
 * Returns a list of human-readable problems; an empty list means the head journal is safe to merge.
 */
export function checkJournals(headEntries, baseEntries) {
  const problems = [];
  const baseByTag = new Map(baseEntries.map((e) => [e.tag, e]));
  const newEntries = headEntries.filter((e) => !baseByTag.has(e.tag));

  const sorted = [...headEntries].sort((a, b) => a.idx - b.idx);
  sorted.forEach((entry, i) => {
    if (entry.idx !== i) {
      problems.push(
        `journal idx is not contiguous from 0: expected idx ${i} but found ${entry.idx} (${entry.tag})`,
      );
    }
    if (i > 0 && !(entry.when > sorted[i - 1].when)) {
      problems.push(
        `journal "when" is not strictly ascending in idx order: ${entry.tag} (${entry.when}) does not come after ${sorted[i - 1].tag} (${sorted[i - 1].when})`,
      );
    }
  });

  const baseMaxWhen = baseEntries.reduce(
    (max, e) => Math.max(max, e.when),
    -Infinity,
  );
  const baseIdx = new Map(baseEntries.map((e) => [e.idx, e]));
  const basePrefix = new Map(baseEntries.map((e) => [tagPrefix(e.tag), e]));
  const seenNewPrefix = new Map();

  for (const entry of newEntries) {
    if (!(entry.when > baseMaxWhen)) {
      problems.push(
        `new migration ${entry.tag} has "when" ${entry.when}, which is not later than the latest on base (${baseMaxWhen}); drizzle would skip it on databases that already applied the latest base migration`,
      );
    }
    const idxClash = baseIdx.get(entry.idx);
    if (idxClash) {
      problems.push(
        `new migration ${entry.tag} reuses idx ${entry.idx} already taken by ${idxClash.tag} on base`,
      );
    }
    const prefix = tagPrefix(entry.tag);
    if (prefix !== null) {
      const prefixClash = basePrefix.get(prefix);
      if (prefixClash) {
        problems.push(
          `new migration ${entry.tag} reuses number ${prefix} already taken by ${prefixClash.tag} on base`,
        );
      }
      const earlier = seenNewPrefix.get(prefix);
      if (earlier) {
        problems.push(
          `new migrations ${earlier.tag} and ${entry.tag} share number ${prefix}`,
        );
      }
      seenNewPrefix.set(prefix, entry);
    }
  }
  return problems;
}

export const FIX_HINT = `How to fix:
  1. Rebase (or merge) your branch on the latest main.
  2. Regenerate the migration with \`pnpm --filter @greenroom/db generate\`, or edit the journal by hand:
     give the entry the next free idx and tag number and a "when" later than the latest entry on main.
  3. Rename the .sql file and the snapshot in migrations/meta to match the new tag.
  Never rename or regenerate a migration that is already applied to staging or prod.`;

function readJournal(ref, cwd) {
  try {
    const out = execFileSync("git", ["show", `${ref}:${JOURNAL_PATH}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out).entries ?? [];
  } catch (err) {
    const stderr = String(err.stderr ?? "");
    if (
      /exists on disk, but not in|does not exist in|path .* does not exist/i.test(
        stderr,
      )
    )
      return [];
    throw new Error(
      `cannot read ${JOURNAL_PATH} at ${ref}: ${stderr.trim() || err.message}`,
    );
  }
}

function main(argv) {
  const baseFlag = argv.indexOf("--base");
  const base = baseFlag >= 0 ? argv[baseFlag + 1] : "origin/main";
  if (!base) {
    console.error("--base requires a ref");
    return 2;
  }
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let head;
  let baseEntries;
  try {
    head = readJournal("HEAD", cwd);
    baseEntries = readJournal(base, cwd);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  if (JSON.stringify(head) === JSON.stringify(baseEntries)) {
    console.log(`migration journal unchanged vs ${base}`);
    return 0;
  }
  const problems = checkJournals(head, baseEntries);
  if (problems.length === 0) {
    console.log(`migration journal OK vs ${base}`);
    return 0;
  }
  console.error(`Migration journal conflicts with ${base}:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\n${FIX_HINT}`);
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
