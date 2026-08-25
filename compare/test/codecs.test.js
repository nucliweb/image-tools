import { test } from "node:test";
import assert from "node:assert/strict";
import { CODECS, buildEncodeArgs } from "../src/codecs.js";

test("without an effort level, encode args are unchanged", () => {
  assert.deepEqual(buildEncodeArgs(CODECS.jxl, "in", "out", 0.57, null), ["in", "out", "-d", "0.57"]);
});

test("jxl maps effort to -e (higher effort = higher -e), appended after positionals", () => {
  assert.deepEqual(buildEncodeArgs(CODECS.jxl, "in", "out", 0.57, 9), ["in", "out", "-d", "0.57", "-e", "9"]);
});

test("avif maps effort to -s inverted (higher effort = lower speed), before positionals", () => {
  // effort 9 -> speed 10 - 9 = 1 (slower)
  assert.deepEqual(buildEncodeArgs(CODECS.avif, "in", "out", 6, 9), ["-s", "1", "--min", "6", "--max", "6", "in", "out"]);
});

test("webp maps effort to -m on a 0..6 scale, before positionals", () => {
  // effort 10 -> method round(10 * 6 / 10) = 6
  assert.deepEqual(buildEncodeArgs(CODECS.webp, "in", "out", 97, 10), ["-m", "6", "-q", "97", "in", "-o", "out"]);
});

test("codecs without an effort knob ignore the level", () => {
  assert.deepEqual(buildEncodeArgs(CODECS.mozjpeg, "in", "out", 96, 9), ["-quality", "96", "-outfile", "out", "in"]);
  assert.deepEqual(buildEncodeArgs(CODECS.jpegli, "in", "out", 0.9, 9), ["in", "out", "-d", "0.9"]);
});
