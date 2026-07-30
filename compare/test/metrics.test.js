import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSsimulacra2, parseDssim } from "../src/metrics.js";

test("parses the ssimulacra2 score", () => {
  assert.equal(parseSsimulacra2("81.87825876\n"), 81.87825876);
});

test("parses ssimulacra2 output with surrounding whitespace", () => {
  assert.equal(parseSsimulacra2("  90.5  "), 90.5);
});

test("parses the dssim score, ignoring the trailing filename", () => {
  // dssim prints: "<score>\t<distorted-path>"
  assert.equal(parseDssim("0.00091624\t/tmp/x/jxl_dec.png\n"), 0.00091624);
});

test("throws on unparseable metric output", () => {
  assert.throws(() => parseSsimulacra2("error: file not found"));
  assert.throws(() => parseDssim(""));
});
