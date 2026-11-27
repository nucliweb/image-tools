import { test } from "node:test";
import assert from "node:assert/strict";
import { searchForTarget, searchForBudget } from "../src/search.js";

test("converges to the target on an increasing function", () => {
  // evaluate(x) = x, so the target score equals the value we search for.
  const result = searchForTarget({
    lo: 0,
    hi: 100,
    target: 63,
    tolerance: 0.1,
    increasing: true,
    evaluate: (x) => x,
  });
  assert.ok(Math.abs(result.score - 63) <= 0.1, `score ${result.score}`);
  assert.ok(Math.abs(result.value - 63) <= 0.5, `value ${result.value}`);
});

test("converges when the score decreases as the knob increases", () => {
  // Distance knobs (cjxl -d): higher x means lower quality/score.
  const result = searchForTarget({
    lo: 0,
    hi: 100,
    target: 30,
    tolerance: 0.1,
    increasing: false,
    evaluate: (x) => 100 - x,
  });
  assert.ok(Math.abs(result.score - 30) <= 0.1, `score ${result.score}`);
  assert.ok(Math.abs(result.value - 70) <= 0.5, `value ${result.value}`);
});

test("stops at maxIterations and returns the closest seen", () => {
  let calls = 0;
  const result = searchForTarget({
    lo: 0,
    hi: 100,
    target: 42,
    tolerance: 0, // impossible to hit exactly with floats -> exhaust iterations
    maxIterations: 8,
    increasing: true,
    evaluate: (x) => {
      calls += 1;
      return x;
    },
  });
  assert.equal(calls, 8);
  assert.ok(Math.abs(result.score - 42) < 1, `score ${result.score}`);
});

test("clamps the target to the achievable range at the bounds", () => {
  // Target above what the max knob can reach: returns the closest bound.
  const result = searchForTarget({
    lo: 0,
    hi: 100,
    target: 999,
    tolerance: 0.1,
    increasing: true,
    evaluate: (x) => x,
  });
  assert.ok(result.value <= 100 && result.value >= 99, `value ${result.value}`);
});

// Budget search: the size grows with quality, so the best setting is the one
// with the largest file that still fits.

test("budget search returns the largest size that fits", () => {
  // bytes(q) = 1000 * q on a 0..100 quality knob; 42,500 bytes fit at q <= 42.5.
  const result = searchForBudget({
    lo: 0,
    hi: 100,
    budget: 42500,
    increasing: true,
    evaluate: (q) => Math.round(1000 * q),
  });
  assert.equal(result.fits, true);
  assert.ok(result.bytes <= 42500, `bytes ${result.bytes}`);
  assert.ok(result.bytes >= 42500 * 0.99, `within 1% under the budget, got ${result.bytes}`);
});

test("budget search handles knobs where a higher value means a smaller file", () => {
  // Distance knobs (cjxl -d): bytes fall as the knob rises.
  const result = searchForBudget({
    lo: 0,
    hi: 100,
    budget: 30000,
    increasing: false,
    evaluate: (d) => Math.round(1000 * (100 - d)),
  });
  assert.equal(result.fits, true);
  assert.ok(result.bytes <= 30000 && result.bytes >= 29700, `bytes ${result.bytes}`);
  assert.ok(Math.abs(result.value - 70) <= 0.5, `value ${result.value}`);
});

test("budget search never returns an evaluation over the budget when one fits", () => {
  // Coarse steps: every evaluation lands on a multiple of 10,000 bytes, so the
  // closest size (50,000) is over the budget and the answer is the 40,000 below it.
  const result = searchForBudget({
    lo: 0,
    hi: 100,
    budget: 49000,
    maxIterations: 10,
    increasing: true,
    evaluate: (q) => Math.round(q / 10) * 10000,
  });
  assert.equal(result.fits, true);
  assert.equal(result.bytes, 40000);
});

test("budget search reports the smallest file when nothing fits", () => {
  // Even the lowest quality is 5,000 bytes against a 1,000-byte budget.
  const result = searchForBudget({
    lo: 0,
    hi: 100,
    budget: 1000,
    increasing: true,
    evaluate: (q) => 5000 + Math.round(100 * q),
  });
  assert.equal(result.fits, false);
  assert.ok(result.bytes < 5100, `closest to the lowest setting, got ${result.bytes}`);
});

test("budget search stops early once within the tolerance under the budget", () => {
  let calls = 0;
  searchForBudget({
    lo: 0,
    hi: 100,
    budget: 50000,
    tolerance: 1000,
    increasing: true,
    evaluate: (q) => {
      calls += 1;
      return Math.round(1000 * q); // the first midpoint, q = 50, is exactly 50,000
    },
  });
  assert.equal(calls, 1);
});
