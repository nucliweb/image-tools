import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByteSize } from "../src/budget.js";

test("KB and MB are decimal (1000), KiB and MiB binary (1024)", () => {
  assert.equal(parseByteSize("50KB").bytes, 50000);
  assert.equal(parseByteSize("50KiB").bytes, 51200);
  assert.equal(parseByteSize("1.5MB").bytes, 1500000);
  assert.equal(parseByteSize("2MiB").bytes, 2097152);
});

test("a bare number or a B suffix is a byte count", () => {
  assert.equal(parseByteSize("48000").bytes, 48000);
  assert.equal(parseByteSize("48000B").bytes, 48000);
});

test("units are case-insensitive and may be separated by a space", () => {
  assert.equal(parseByteSize("50kb").bytes, 50000);
  assert.equal(parseByteSize("50 kib").bytes, 51200);
});

test("keeps a normalized label of what was asked for", () => {
  assert.equal(parseByteSize("50kb").label, "50 KB");
  assert.equal(parseByteSize("50 kib").label, "50 KiB");
  assert.equal(parseByteSize("48000").label, "48000 B");
});

test("rejects unknown units, non-numbers and budgets under one byte", () => {
  for (const value of ["50kbit", "fifty KB", "", "0KB", "-5KB", "0.5"]) {
    assert.throws(() => parseByteSize(value), /--target-bytes/, `rejects "${value}"`);
  }
});

test("rounds a fractional byte count down, so the budget is never exceeded", () => {
  assert.equal(parseByteSize("1.0005KB").bytes, 1000);
});
