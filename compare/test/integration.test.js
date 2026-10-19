// End-to-end tests that drive the real pipeline: encode with a codec, decode,
// strip, and measure with ssimulacra2/dssim. They need the codecs on PATH, so
// they are skipped where the tools are absent (e.g. the bare unit-test CI job)
// and run for real inside the Docker image or on a full local setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { CODECS } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { sweepCodec } from "../src/sweep.js";
import { writeStrippedPng, pngDimensions } from "../src/image.js";
import { resolveCommand } from "../src/exec.js";
import { parseResultsCsv } from "../src/regression.js";

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

// The remaining default codecs: each one searched to a real target, checked by the
// file its encoder wrote (format signature) and the knob it reports.
const isJpeg = (buf) => buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
const isoBrand = (buf) => (buf.subarray(4, 8).toString("latin1") === "ftyp" ? buf.subarray(8, 12).toString("latin1") : null);
const DEFAULT_CASES = [
  { id: "avif", tools: ["avifenc", "avifdec"], label: /^--min\/max \d+$/, format: (buf) => isoBrand(buf) === "avif" },
  { id: "jpegli", tools: ["cjpegli", "djpegli"], label: /^-d [\d.]+$/, format: isJpeg },
  { id: "mozjpeg", tools: [CODECS.mozjpeg.encoder, "djpegli"], label: /^-quality \d+$/, format: isJpeg },
  { id: "heic", tools: ["heif-enc", "heif-convert"], label: /^-q \d+$/, format: (buf) => ["heic", "mif1"].includes(isoBrand(buf)) },
];

for (const { id, tools, label, format } of DEFAULT_CASES) {
  const codec = CODECS[id];
  test(`searches ${codec.name} to a real perceptual target`, { skip: toolsPresent([...tools, ...METRICS]) ? false : "codecs not on PATH" }, () => {
    withWorkdir((dir) => {
      const ref = join(dir, "ref.png");
      makeTestPng(ref, 128, 96);
      const r = findQualityForTarget(codec, ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
      assert.ok(r.bytes > 0 && r.bpp > 0);
      assert.ok(Number.isFinite(r.ssimulacra2) && Number.isFinite(r.dssim));
      assert.ok(r.reached ? Math.abs(r.ssimulacra2 - 85) <= 1.5 : true, "near the target unless the range was exhausted");
      assert.match(r.label, label);
      assert.ok(format(readFileSync(join(dir, `${id}.${codec.ext}`))), `the encoder wrote a ${codec.name} file`);
    });
  });
}

const CLI = fileURLToPath(new URL("../bin/compare.js", import.meta.url));
const bd = (rate) => (rate === null ? "n/a" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`);

test("one run writes the table, CSV and HTML report from the same search", { skip: jxlReady && webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const images = join(dir, "images");
    mkdirSync(images);
    makeTestPng(join(images, "a.png"), 128, 96);
    makeTestPng(join(images, "b.png"), 96, 128);
    const csvPath = join(dir, "out.csv");
    const htmlPath = join(dir, "out.html");

    const res = spawnSync(process.execPath, [CLI, images, "--target", "85", "--codecs", "jxl,webp", "--csv", csvPath, "--html", htmlPath], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Codec comparison/, "prints the comparison table");
    assert.match(res.stdout, /Batch summary/, "prints the batch summary");

    const rows = parseResultsCsv(readFileSync(csvPath, "utf8"));
    assert.equal(rows.length, 4, "one CSV row per image and codec");
    if (existsSync("/usr/bin/time")) {
      const [header, ...lines] = readFileSync(csvPath, "utf8").trim().split("\n");
      const at = header.split(",").indexOf("encode_peak_rss_bytes");
      assert.ok(lines.every((l) => Number(l.split(",")[at]) > 0), "each row carries the encoder's peak memory");
    }

    const json = readFileSync(htmlPath, "utf8").match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1];
    const data = JSON.parse(json);
    for (const row of rows) {
      const image = data.images.find((im) => im.name === row.image);
      const codec = image.codecs.find((c) => c.name === row.codec);
      assert.equal(codec.preview.bytes, row.bytes, `${row.image} ${row.codec}: HTML preview matches the CSV`);
      assert.ok(codec.points.length >= 3, "the report still carries the rate-distortion sweep");
    }
  });
});

test("RD mode searches every codec at each target and rates it against the baseline", { skip: jxlReady && webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const images = join(dir, "images");
    mkdirSync(images);
    makeTestPng(join(images, "a.png"), 128, 96);
    makeTestPng(join(images, "b.png"), 96, 128);
    const csvPath = join(dir, "rd.csv");

    const res = spawnSync(process.execPath, [CLI, images, "--rd", "75,85", "--codecs", "jxl,webp", "--csv", csvPath], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Rate–distortion — a\.png/, "prints one RD table per image");
    assert.match(res.stdout, /bpp @75 \| bpp @85 \| BD-rate vs JPEG XL/, "first codec is the baseline without mozjpeg");
    assert.match(res.stdout, /Rate–distortion summary — 2 images/, "prints the batch summary");
    assert.doesNotMatch(res.stdout, /Codec comparison/, "replaces the single-target table");

    const lines = readFileSync(csvPath, "utf8").trim().split("\n");
    assert.equal(lines[0], "image,codec,target,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations,error");
    assert.equal(lines.length - 1, 2 * 2 * 2, "one CSV row per image, codec and target");
    const webp85 = lines.find((l) => l.startsWith("a.png,WebP,85,"));
    assert.ok(webp85, "a row for each target");
  });
});

test("WebP sharp YUV encodes with -sharp_yuv and decodes like WebP", { skip: webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS["webp-sharp"], ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    assert.equal(r.name, "WebP sharp YUV");
    assert.match(r.label, /-q \d+/);
  });
});

const heicReady = toolsPresent(["heif-enc", "heif-convert", ...METRICS]);

test("HEIC 4:4:4 encodes full-resolution chroma", { skip: heicReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS["heic-444"], ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    const info = spawnSync(resolveCommand("heif-info"), [join(dir, "heic-444.heic")], { encoding: "utf8" });
    assert.match(info.stdout, /4:4:4/, "heif-info reports 4:4:4 chroma");
  });
});

// rav1e and SVT-AV1 are optional libavif encoders; Homebrew's avifenc ships with
// neither, so their tests run only where avifenc --version lists them.
function avifEncoderReady(name) {
  if (!toolsPresent(["avifenc", "avifdec", ...METRICS])) return false;
  const v = spawnSync(resolveCommand("avifenc"), ["--version"], { encoding: "utf8" });
  return new RegExp(`${name} \\[enc`).test(`${v.stdout}${v.stderr}`);
}
const rav1eReady = avifEncoderReady("rav1e");

test("AVIF rav1e encodes with libavif's rav1e encoder", { skip: rav1eReady ? false : "avifenc without rav1e" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS["avif-rav1e"], ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    assert.equal(r.name, "AVIF rav1e");
  });
});

const turboReady = toolsPresent(["cjpeg", "vips", "djpegli", ...METRICS]);

test("libjpeg-turbo encodes from a PPM copy of the reference", { skip: turboReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS["jpeg-turbo"], ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    assert.match(r.label, /-quality \d+/);
    assert.ok(readFileSync(join(dir, "reference.norm.ppm")).subarray(0, 2).equals(Buffer.from("P6")), "the encoder read a binary PPM");
  });
});

test("RD mode with --html plots the measured RD points and the BD-rates of the table", { skip: jxlReady && webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const images = join(dir, "images");
    mkdirSync(images);
    makeTestPng(join(images, "a.png"), 128, 96);
    makeTestPng(join(images, "b.png"), 96, 128);
    const csvPath = join(dir, "rd.csv");
    const htmlPath = join(dir, "rd.html");

    const res = spawnSync(process.execPath, [CLI, images, "--rd", "75,85", "--target", "85", "--codecs", "jxl,webp", "--csv", csvPath, "--html", htmlPath], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);

    const json = readFileSync(htmlPath, "utf8").match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1];
    const data = JSON.parse(json);
    assert.equal(data.target, 85, "the viewer shows the encodes at --target");
    assert.deepEqual(data.rd.targets, [75, 85]);
    assert.equal(data.rd.baselineId, "jxl");

    const rows = readFileSync(csvPath, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
    for (const image of data.images) {
      for (const codec of image.codecs) {
        const csvBytes = rows.filter((r) => r[0] === image.name && r[1] === codec.name).map((r) => Number(r[4]));
        assert.deepEqual(codec.points.map((p) => p.bytes).sort((a, b) => a - b), csvBytes.sort((a, b) => a - b), `${image.name} ${codec.name}: one point per RD target`);
        const at85 = rows.find((r) => r[0] === image.name && r[1] === codec.name && r[2] === "85");
        assert.equal(codec.preview.bytes, Number(at85[4]), "the preview is the encode at --target");
      }
      // The table prints the same BD-rate (or n/a when the curves cannot be compared).
      const webp = image.codecs.find((c) => c.id === "webp");
      const table = res.stdout.slice(res.stdout.indexOf(`Rate–distortion — ${image.name}`));
      const webpRow = table.split("\n").find((l) => l.startsWith("| WebP "));
      assert.ok(webpRow.includes(bd(webp.bd)), `${image.name}: the same BD-rate as the table`);
    }
    const mean = data.rd.aggregate.find((r) => r.id === "webp").meanBdRate;
    const summaryRow = res.stdout.slice(res.stdout.indexOf("Rate–distortion summary")).split("\n").find((l) => l.startsWith("| WebP "));
    assert.ok(summaryRow.includes(bd(mean)), "the same mean BD-rate as the summary");
  });
});

test("a codec failing on an image is reported, and the run carries on", { skip: jxlReady && webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    // A cwebp that always fails, ahead of the real one on PATH.
    const fakeBin = join(dir, "bin");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "cwebp"), '#!/bin/sh\necho "simulated encoder error: unsupported input" >&2\nexit 1\n', { mode: 0o755 });
    const images = join(dir, "images");
    mkdirSync(images);
    makeTestPng(join(images, "a.png"), 128, 96);
    makeTestPng(join(images, "b.png"), 96, 128);
    const csvPath = join(dir, "out.csv");
    const htmlPath = join(dir, "out.html");
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };

    const res = spawnSync(process.execPath, [CLI, images, "--target", "85", "--codecs", "jxl,webp", "--csv", csvPath, "--html", htmlPath], { encoding: "utf8", env });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\| WebP +\| — +\| +failed \|/, "the failed codec has a row");
    assert.match(res.stdout, /† WebP failed: simulated encoder error: unsupported input/);
    assert.match(res.stdout, /Batch summary/, "the batch still completes");
    assert.match(res.stderr, /WebP failed on a\.png/);

    const lines = readFileSync(csvPath, "utf8").trim().split("\n");
    assert.ok(lines.some((l) => /^a\.png,JPEG XL,-d [\d.]+,\d+,/.test(l)), "JPEG XL is still measured");
    assert.ok(lines.some((l) => l.startsWith("a.png,WebP,") && l.endsWith(",simulated encoder error: unsupported input")));

    const json = readFileSync(htmlPath, "utf8").match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1];
    const names = JSON.parse(json).images[0].codecs.map((c) => c.name);
    assert.deepEqual(names, ["JPEG XL"], "the report leaves the failed codec out");
  });
});

test("in RD mode a failed target is reported and the curve keeps the others", { skip: jxlReady && webpReady ? false : "codecs not on PATH" }, () => {
  withWorkdir((dir) => {
    const fakeBin = join(dir, "bin");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "cwebp"), '#!/bin/sh\necho "simulated encoder error" >&2\nexit 1\n', { mode: 0o755 });
    const ref = join(dir, "a.png");
    makeTestPng(ref, 128, 96);
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };

    const res = spawnSync(process.execPath, [CLI, ref, "--rd", "75,85", "--codecs", "jxl,webp"], { encoding: "utf8", env });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\| WebP +\| +failed \| +failed \| +n\/a \|/);
    assert.match(res.stdout, /† WebP failed at 75: simulated encoder error/);
  });
});

const svtReady = avifEncoderReady("svt");

test("AVIF SVT-AV1 encodes 4:2:0 with libavif's SVT-AV1 encoder", { skip: svtReady ? false : "avifenc without svt" }, () => {
  withWorkdir((dir) => {
    const ref = join(dir, "ref.png");
    makeTestPng(ref, 128, 96);
    const r = findQualityForTarget(CODECS["avif-svt"], ref, 85, dir, { tolerance: 0.5, maxIterations: 8 });
    assert.ok(r.bytes > 0 && r.bpp > 0);
    assert.equal(r.name, "AVIF SVT-AV1");
  });
});
