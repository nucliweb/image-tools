import { test } from "node:test";
import assert from "node:assert/strict";
import { searchForTarget } from "../src/search.js";

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
