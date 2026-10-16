import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTargets, bdRate, imageBdRates, aggregateBdRates } from "../src/rd.js";

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);

const curve = (pairs) => pairs.map(([ssimulacra2, bpp]) => ({ ssimulacra2, bpp }));

test("parseTargets reads a sorted, de-duplicated list of scores", () => {
  assert.deepEqual(parseTargets("90, 70,80,80"), [70, 80, 90]);
});

test("parseTargets rejects fewer than two targets or non-numbers", () => {
  assert.throws(() => parseTargets("90"), /at least two/);
  assert.throws(() => parseTargets("70,abc"), /number/);
});

test("bdRate is 0 for identical curves", () => {
  const a = curve([[70, 1], [80, 2], [90, 4]]);
  near(bdRate(a, a), 0);
});

test("bdRate is -50% when the test codec needs half the bits at every quality", () => {
  const anchor = curve([[70, 1], [80, 2], [90, 4]]);
  const half = curve([[70, 0.5], [80, 1], [90, 2]]);
  near(bdRate(anchor, half), -50);
  near(bdRate(half, anchor), 100);
});

test("bdRate only integrates over the quality range both curves cover", () => {
  // Anchor spans 70..90 (2 bpp at 80 by log interpolation); the test curve spans
  // 80..95 and is 20% smaller than the anchor across the shared 80..90 range.
  const anchor = curve([[70, 1], [90, 4]]);
  const test = curve([[80, 1.6], [90, 3.2], [95, 5]]);
  near(bdRate(anchor, test), -20);
});

test("bdRate ignores point order and duplicate qualities", () => {
  const anchor = curve([[90, 4], [70, 1], [80, 2], [80, 2]]);
  const half = curve([[80, 1], [90, 2], [70, 0.5]]);
  near(bdRate(anchor, half), -50);
});

test("bdRate is null without an overlapping range or enough points", () => {
  const low = curve([[60, 1], [70, 2]]);
  const high = curve([[80, 1], [90, 2]]);
  assert.equal(bdRate(low, high), null);
  assert.equal(bdRate(curve([[80, 1]]), high), null);
  // A codec pinned at its range bound lands on the same quality at every target.
  assert.equal(bdRate(curve([[80, 1], [80, 1]]), high), null);
});

const codecs = (halfBpp) => [
  { id: "jxl", name: "JPEG XL", points: curve([[70, halfBpp], [90, halfBpp * 4]]) },
  { id: "mozjpeg", name: "mozjpeg", points: curve([[70, 1], [90, 4]]) },
];

test("imageBdRates rates every codec against the baseline", () => {
  const rates = imageBdRates(codecs(0.5), "mozjpeg");
  near(rates.get("jxl"), -50);
  near(rates.get("mozjpeg"), 0);
});

test("imageBdRates is all null when the baseline is missing", () => {
  const rates = imageBdRates(codecs(0.5), "webp");
  assert.equal(rates.get("jxl"), null);
});

test("aggregateBdRates averages per codec, skips nulls and sorts best first", () => {
  const perImage = [{ codecs: codecs(0.5) }, { codecs: codecs(0.7) }];
  const rows = aggregateBdRates(perImage, "mozjpeg");

  assert.equal(rows[0].id, "jxl");
  near(rows[0].meanBdRate, -40); // mean of -50% and -30%
  assert.equal(rows[0].rated, 2);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[1].id, "mozjpeg");
});

test("aggregateBdRates reports null for a codec never rated", () => {
  const perImage = [
    {
      codecs: [
        { id: "heic", name: "HEIC", points: curve([[95, 1], [96, 2]]) },
        { id: "mozjpeg", name: "mozjpeg", points: curve([[70, 1], [90, 4]]) },
      ],
    },
  ];
  const heic = aggregateBdRates(perImage, "mozjpeg").find((r) => r.id === "heic");
  assert.equal(heic.meanBdRate, null);
  assert.equal(heic.rated, 0);
  assert.equal(heic.count, 1);
});

test("bdRate ignores failed points", () => {
  const anchor = curve([[70, 1], [80, 2], [90, 4]]);
  const half = [...curve([[70, 0.5], [80, 1], [90, 2]]), { target: 95, failed: true, error: "boom" }];
  near(bdRate(anchor, half), -50);
});
