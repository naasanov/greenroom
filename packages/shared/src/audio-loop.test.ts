import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOOP_BEGINNING,
  LOOP_END,
  defaultLoopRange,
  endOptions,
  loopPoints,
  resolveLoopRange,
} from "./audio-loop.js";
import { createAudioMarkerSchema, updateAudioMarkerSchema } from "./audio.js";

const M = (id: string, positionMs: number) => ({ id, title: id, positionMs });
const D = 100_000;

test("loopPoints with no markers", () => {
  assert.deepEqual(
    loopPoints([], D).map((p) => [p.id, p.positionMs]),
    [
      [LOOP_BEGINNING, 0],
      [LOOP_END, D],
    ],
  );
});

test("loopPoints sorts by position then id and clamps", () => {
  const pts = loopPoints(
    [M("b", 5000), M("a", 5000), M("z", -5), M("y", D + 9)],
    D,
  );
  assert.deepEqual(
    pts.map((p) => [p.id, p.positionMs]),
    [
      [LOOP_BEGINNING, 0],
      ["z", 0],
      ["a", 5000],
      ["b", 5000],
      ["y", D],
      [LOOP_END, D],
    ],
  );
  assert.equal(pts[2]!.label, "a");
});

test("defaultLoopRange: no markers, between, before, after", () => {
  assert.deepEqual(defaultLoopRange(loopPoints([], D), 500), {
    startId: LOOP_BEGINNING,
    endId: LOOP_END,
  });
  const pts = loopPoints([M("a", 10_000), M("b", 20_000)], D);
  assert.deepEqual(defaultLoopRange(pts, 15_000), { startId: "a", endId: "b" });
  assert.deepEqual(defaultLoopRange(pts, 5000), {
    startId: LOOP_BEGINNING,
    endId: "a",
  });
  assert.deepEqual(defaultLoopRange(pts, 50_000), {
    startId: "b",
    endId: LOOP_END,
  });
});

test("defaultLoopRange: marker at the playhead is the start", () => {
  const pts = loopPoints([M("a", 10_000), M("b", 20_000)], D);
  assert.deepEqual(defaultLoopRange(pts, 10_000), { startId: "a", endId: "b" });
  assert.deepEqual(defaultLoopRange(pts, 0), {
    startId: LOOP_BEGINNING,
    endId: "a",
  });
});

test("defaultLoopRange with duplicate positions and a marker at 0", () => {
  const pts = loopPoints([M("a", 0), M("b", 10_000), M("c", 10_000)], D);
  // Last point at or before the playhead wins; the end is strictly later.
  assert.deepEqual(defaultLoopRange(pts, 0), { startId: "a", endId: "b" });
  assert.deepEqual(defaultLoopRange(pts, 10_000), {
    startId: "c",
    endId: LOOP_END,
  });
});

test("defaultLoopRange with a marker at the duration", () => {
  const pts = loopPoints([M("a", D)], D);
  assert.deepEqual(defaultLoopRange(pts, 1000), {
    startId: LOOP_BEGINNING,
    endId: "a",
  });
  const r = defaultLoopRange(pts, D);
  assert.equal(r.startId, LOOP_BEGINNING);
  assert.equal(r.endId, "a");
});

test("endOptions are strictly after the start", () => {
  const pts = loopPoints([M("a", 10_000), M("b", 10_000), M("c", 30_000)], D);
  assert.deepEqual(
    endOptions(pts, "a").map((p) => p.id),
    ["c", LOOP_END],
  );
  assert.deepEqual(
    endOptions(pts, LOOP_BEGINNING).map((p) => p.id),
    ["a", "b", "c", LOOP_END],
  );
  assert.deepEqual(endOptions(pts, LOOP_END), []);
  assert.deepEqual(endOptions(pts, "gone"), []);
});

test("resolveLoopRange keeps a valid range", () => {
  const pts = loopPoints([M("a", 10_000), M("b", 20_000)], D);
  assert.deepEqual(resolveLoopRange(pts, "a", LOOP_END, 0), {
    startId: "a",
    endId: LOOP_END,
    startMs: 10_000,
    endMs: D,
  });
});

test("resolveLoopRange falls back when a marker vanished or end is invalid", () => {
  const pts = loopPoints([M("a", 10_000), M("b", 20_000)], D);
  const fb = {
    startId: "a",
    endId: "b",
    startMs: 10_000,
    endMs: 20_000,
  };
  assert.deepEqual(resolveLoopRange(pts, "gone", "b", 12_000), fb);
  assert.deepEqual(resolveLoopRange(pts, "a", "gone", 12_000), fb);
  assert.deepEqual(resolveLoopRange(pts, "b", "a", 12_000), fb);
  assert.deepEqual(resolveLoopRange(pts, "a", "a", 12_000), fb);
});

test("marker schemas", () => {
  assert.deepEqual(
    createAudioMarkerSchema.parse({ positionMs: 0, title: "  Hi " }),
    {
      positionMs: 0,
      title: "Hi",
    },
  );
  assert.equal(
    createAudioMarkerSchema.safeParse({ positionMs: -1, title: "x" }).success,
    false,
  );
  assert.equal(
    createAudioMarkerSchema.safeParse({ positionMs: 1.5, title: "x" }).success,
    false,
  );
  assert.equal(
    createAudioMarkerSchema.safeParse({ positionMs: 1, title: "  " }).success,
    false,
  );
  assert.equal(
    createAudioMarkerSchema.safeParse({ positionMs: 1, title: "x".repeat(81) })
      .success,
    false,
  );
  assert.equal(updateAudioMarkerSchema.safeParse({}).success, false);
  assert.equal(
    updateAudioMarkerSchema.safeParse({ title: "ok" }).success,
    true,
  );
});

test("defaultLoopRange at the end never returns End to End", () => {
  assert.deepEqual(defaultLoopRange(loopPoints([], D), D), {
    startId: LOOP_BEGINNING,
    endId: LOOP_END,
  });
  const mid = loopPoints([M("a", 50_000)], D);
  assert.deepEqual(defaultLoopRange(mid, D), { startId: "a", endId: LOOP_END });
  const atEnd = loopPoints([M("a", 50_000), M("z", D)], D);
  assert.deepEqual(defaultLoopRange(atEnd, D), { startId: "a", endId: "z" });
});

test("resolveLoopRange never returns a zero-length range", () => {
  const pts = loopPoints([M("a", 50_000)], D);
  const r = resolveLoopRange(pts, "a", LOOP_END, D)!;
  assert.ok(r.endMs > r.startMs);
  const atEnd = resolveLoopRange(pts, LOOP_END, LOOP_END, D)!;
  assert.deepEqual([atEnd.startId, atEnd.endId], ["a", LOOP_END]);
  assert.equal(resolveLoopRange(loopPoints([], 0), "", "", 0), null);
});
