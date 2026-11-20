import { test } from "node:test";
import assert from "node:assert/strict";
import { loadInDate, loadInIsDayBefore } from "./load-in.js";

test("midnight start with 11 PM load-in is the day before", () => {
  assert.equal(loadInIsDayBefore("00:00", "23:00"), true);
  assert.equal(loadInDate("2026-11-20", "00:00", "23:00"), "2026-11-19");
});

test("normal evening gig keeps the gig date", () => {
  assert.equal(loadInIsDayBefore("20:00", "18:00"), false);
  assert.equal(loadInDate("2026-11-20", "20:00", "18:00"), "2026-11-20");
});

test("equal times keep the gig date", () => {
  assert.equal(loadInIsDayBefore("20:00", "20:00"), false);
  assert.equal(loadInDate("2026-11-20", "20:00", "20:00"), "2026-11-20");
});

test("missing times keep the gig date", () => {
  assert.equal(loadInIsDayBefore(null, "23:00"), false);
  assert.equal(loadInIsDayBefore("00:00", null), false);
  assert.equal(loadInIsDayBefore("", "23:00"), false);
  assert.equal(loadInDate("2026-11-20", undefined, "23:00"), "2026-11-20");
});

test("day before crosses month and year boundaries", () => {
  assert.equal(loadInDate("2026-12-01", "01:00", "23:30"), "2026-11-30");
  assert.equal(loadInDate("2027-01-01", "00:00", "22:00"), "2026-12-31");
});
