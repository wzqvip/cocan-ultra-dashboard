import test from "node:test";
import assert from "node:assert/strict";

import { normalizeHistorySamples } from "../assets/js/data.js";

test("history samples are sorted by time", () => {
  const samples = [
    { t: 3000, powerW: 30 },
    { t: 1000, powerW: 10 },
    { t: 2000, powerW: 20 },
  ];
  assert.deepEqual(
    normalizeHistorySamples(samples).map((s) => s.t),
    [1000, 2000, 3000],
  );
});

test("history samples dedupe timestamps and keep the last value", () => {
  const samples = [
    { t: 1000, powerW: 1 },
    { t: 1000, powerW: 9 },
    { t: 2000, powerW: 2 },
  ];
  const normalized = normalizeHistorySamples(samples);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].powerW, 9);
});

test("history normalization drops invalid samples", () => {
  const samples = [
    { t: 1000, powerW: 1 },
    { t: Number.NaN, powerW: 2 },
    { t: 2000, powerW: Number.NaN },
    null,
  ];
  assert.deepEqual(
    normalizeHistorySamples(samples).map((s) => s.t),
    [1000],
  );
});

test("history normalization tolerates a missing/non-array value", () => {
  assert.deepEqual(normalizeHistorySamples(null), []);
  assert.deepEqual(normalizeHistorySamples("oops"), []);
});
