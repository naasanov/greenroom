import assert from "node:assert/strict";
import { test } from "node:test";
import { checkJournals } from "./check-migration-journal.mjs";

const entry = (idx, tag, when) => ({
  idx,
  version: "7",
  when,
  tag,
  breakpoints: true,
});
const base = [
  entry(0, "0000_init", 1000),
  entry(1, "0001_a", 2000),
  entry(2, "0002_b", 3000),
];

test("a normal new migration passes", () => {
  const head = [...base, entry(3, "0003_c", 4000)];
  assert.deepEqual(checkJournals(head, base), []);
});

test("no change passes", () => {
  assert.deepEqual(checkJournals(base, base), []);
});

test("a new migration with an older when fails", () => {
  const head = [
    ...base.slice(0, 2),
    entry(2, "0002_b", 3000),
    entry(3, "0003_c", 2500),
  ];
  const problems = checkJournals(head, base);
  assert.ok(problems.some((p) => /not later than the latest on base/.test(p)));
});

test("a new migration with the same when as base max fails", () => {
  const head = [...base, entry(3, "0003_c", 3000)];
  assert.ok(checkJournals(head, base).length > 0);
});

test("a duplicate idx fails", () => {
  const head = [base[0], base[1], entry(2, "0002_other", 5000)];
  const problems = checkJournals(head, base);
  assert.ok(problems.some((p) => /reuses idx 2/.test(p)));
});

test("a duplicate tag number with a different tag fails", () => {
  const head = [...base, entry(3, "0002_other", 5000)];
  const problems = checkJournals(head, base);
  assert.ok(problems.some((p) => /reuses number 0002/.test(p)));
});

test("two new migrations sharing a number fail", () => {
  const head = [...base, entry(3, "0003_x", 5000), entry(4, "0003_y", 6000)];
  assert.ok(checkJournals(head, base).some((p) => /share number 0003/.test(p)));
});

test("a non-contiguous idx fails", () => {
  const head = [...base, entry(4, "0004_c", 5000)];
  assert.ok(checkJournals(head, base).some((p) => /not contiguous/.test(p)));
});

test("a non-ascending when in idx order fails", () => {
  const head = [base[0], entry(1, "0001_a", 2000), entry(2, "0002_b", 1500)];
  assert.ok(
    checkJournals(head, base.slice(0, 2)).some((p) =>
      /strictly ascending/.test(p),
    ),
  );
});

test("an empty base accepts a well-formed journal", () => {
  assert.deepEqual(checkJournals(base, []), []);
});
