import { test } from "node:test";
import assert from "node:assert/strict";
import { median } from "../src/pipeline.js";

test("median of an odd-length list is the middle value", () => {
  assert.equal(median([30, 10, 20]), 20);
});

test("median of an even-length list averages the two middle values", () => {
  assert.equal(median([10, 20, 30, 40]), 25);
});

test("median is null when any sample is missing (timing unavailable)", () => {
  assert.equal(median([10, null, 20]), null);
});

test("median is null for an empty list", () => {
  assert.equal(median([]), null);
});
