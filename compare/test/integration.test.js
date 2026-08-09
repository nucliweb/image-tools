// End-to-end tests that drive the real pipeline: encode with a codec, decode,
// strip, and measure with ssimulacra2/dssim. They need the codecs on PATH, so
// they are skipped where the tools are absent (e.g. the bare unit-test CI job)
// and run for real inside the Docker image or on a full local setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { CODECS } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { sweepCodec } from "../src/sweep.js";
import { writeStrippedPng, pngDimensions } from "../src/image.js";
import { resolveCommand } from "../src/exec.js";

// --- a self-contained PNG writer, so the tests need no image tool for input ---
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function makeTestPng(path, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 2; // truecolor RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y += 1) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x += 1) {
      raw[o++] = (x * 255) / w; // gradient + a little structure to compress
      raw[o++] = (y * 255) / h;
      raw[o++] = ((x * y) >> 4) & 255;
    }
  }
  writeFileSync(path, Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

function toolsPresent(cmds) {
  try {
    cmds.forEach((c) => resolveCommand(c));
    return true;
  } catch {
    return false;
  }
}

const METRICS = ["ssimulacra2", "dssim"];
const jxlReady = toolsPresent(["cjxl", "djxl", ...METRICS]);
const webpReady = toolsPresent(["cwebp", "dwebp", ...METRICS]);

function withWorkdir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "itest-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("finds a JPEG XL operating point at a real perceptual target", { skip: jxlReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS.jxl, ref, 88, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0, "produced a non-empty file");
    assert.ok(r.bpp > 0);
    assert.ok(Number.isFinite(r.ssimulacra2) && Number.isFinite(r.dssim));
    // Either it landed near the target, or the codec's range was exhausted (clamped).
    assert.ok(r.reached ? Math.abs(r.ssimulacra2 - 88) <= 1.5 : true);
  });
});

test("searches WebP quality to a real perceptual target", { skip: webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS.webp, ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    assert.match(r.label, /-q \d+/);
  });
});

test("sweepCodec builds a rate-distortion curve sorted by quality", { skip: jxlReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const refNorm = join(dir, "ref.norm.png");
    writeStrippedPng(ref, refNorm);
    const { pixels } = pngDimensions(refNorm);
    const { points } = sweepCodec(CODECS.jxl, refNorm, pixels, dir);
    assert.ok(points.length >= 3, "several operating points");
    for (let i = 1; i < points.length; i += 1) {
      assert.ok(points[i].ssimulacra2 >= points[i - 1].ssimulacra2 - 0.01, "sorted by ascending ssimulacra2");
      assert.ok(points[i].bytes > 0);
    }
  });
});
