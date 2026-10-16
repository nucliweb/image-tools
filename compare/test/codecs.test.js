import { test } from "node:test";
import assert from "node:assert/strict";
import { CODECS, DEFAULT_CODECS, buildEncodeArgs, resolveCodecIds } from "../src/codecs.js";

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

test("webp-sharp is WebP with the sharp RGB->YUV conversion, and keeps WebP's effort knob", () => {
  assert.deepEqual(buildEncodeArgs(CODECS["webp-sharp"], "in", "out", 97, null), ["-sharp_yuv", "-q", "97", "in", "-o", "out"]);
  assert.deepEqual(buildEncodeArgs(CODECS["webp-sharp"], "in", "out", 97, 10), ["-m", "6", "-sharp_yuv", "-q", "97", "in", "-o", "out"]);
  assert.equal(CODECS["webp-sharp"].decoder, CODECS.webp.decoder);
});

test("opt-in variants stay out of the default set", () => {
  assert.ok(!DEFAULT_CODECS.includes("webp-sharp"));
});

test("resolveCodecIds reads the default set, an explicit list, or every codec", () => {
  assert.deepEqual(resolveCodecIds(undefined), DEFAULT_CODECS);
  assert.deepEqual(resolveCodecIds("jxl, webp-sharp"), ["jxl", "webp-sharp"]);
  assert.deepEqual(resolveCodecIds("all"), Object.keys(CODECS));
  assert.ok(resolveCodecIds("all").includes("webp-sharp"));
});

test("resolveCodecIds rejects unknown codecs and names the known ones", () => {
  assert.throws(() => resolveCodecIds("jxl,webp2"), /Unknown codec\(s\): webp2\. Known: .*webp-sharp/);
});

test("heic-444 is HEIC with x265 asked for 4:4:4 chroma", () => {
  assert.deepEqual(buildEncodeArgs(CODECS["heic-444"], "in", "out", 80, null), ["-p", "chroma=444", "in", "-q", "80", "-o", "out"]);
  assert.equal(CODECS["heic-444"].decoder, CODECS.heic.decoder);
  assert.ok(!DEFAULT_CODECS.includes("heic-444"));
});

test("avif-rav1e is AVIF encoded by rav1e instead of aom, and keeps AVIF's speed mapping", () => {
  assert.deepEqual(buildEncodeArgs(CODECS["avif-rav1e"], "in", "out", 30, null), ["-c", "rav1e", "--min", "30", "--max", "30", "in", "out"]);
  assert.deepEqual(buildEncodeArgs(CODECS["avif-rav1e"], "in", "out", 30, 9), ["-s", "1", "-c", "rav1e", "--min", "30", "--max", "30", "in", "out"]);
  assert.ok(!DEFAULT_CODECS.includes("avif-rav1e"));
});

test("jpeg-turbo is plain libjpeg-turbo cjpeg with mozjpeg's command line, fed a PPM", () => {
  const turbo = CODECS["jpeg-turbo"];
  assert.equal(turbo.encoder, "cjpeg");
  assert.equal(turbo.inputExt, "ppm");
  assert.deepEqual(buildEncodeArgs(turbo, "in.ppm", "out", 85, 9), ["-quality", "85", "-outfile", "out", "in.ppm"]);
  assert.equal(turbo.decoder, CODECS.mozjpeg.decoder);
  assert.ok(!DEFAULT_CODECS.includes("jpeg-turbo"));
});
