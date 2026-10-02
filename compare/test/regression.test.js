import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv, checkRegressions, baselineFromRows } from "../src/regression.js";
import { toBatchCsv } from "../src/report.js";

const csv = [
  "image,codec,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations,encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms",
  "a.png,JPEG XL,-d 0.6,1000,1.0,90.1000,0.0003,true,6,10,10,50,50",
  "a.png,AVIF,--min/max 6,2000,2.0,89.9000,0.0003,true,5,10,10,50,50",
].join("\n");

const baseline = {
  target: 90,
  images: {
    "a.png": {
      "JPEG XL": { bytes: 1000, ssimulacra2: 90.1 },
      AVIF: { bytes: 2000, ssimulacra2: 89.9 },
    },
  },
};

const opts = { tolerance: 0.02, qualityTolerance: 0.5, target: 90 };

test("parseResultsCsv extracts image, codec, bytes and ssimulacra2", () => {
  assert.deepEqual(parseResultsCsv(csv), [
    { image: "a.png", codec: "JPEG XL", bytes: 1000, ssimulacra2: 90.1 },
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 89.9 },
  ]);
});

test("an image name with a comma survives the CSV round trip", () => {
  const written = toBatchCsv([
    {
      image: "sunset, beach.png",
      results: [{ name: "JPEG XL", label: "-d 0.6", bytes: 1000, bpp: 1, ssimulacra2: 90.1, dssim: 0.0003, reached: true, iterations: 6 }],
    },
  ]);
  assert.deepEqual(parseResultsCsv(written), [{ image: "sunset, beach.png", codec: "JPEG XL", bytes: 1000, ssimulacra2: 90.1 }]);
});

test("passes when sizes are within tolerance (smaller or a hair larger)", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1015, ssimulacra2: 90.1 }, // +1.5%, within 2%
    { image: "a.png", codec: "AVIF", bytes: 1990, ssimulacra2: 89.9 }, // smaller
  ];
  const { failed } = checkRegressions(baseline, current, opts);
  assert.equal(failed, false);
});

test("fails when a codec grows beyond tolerance", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1030, ssimulacra2: 90.1 }, // +3%, over 2%
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 89.9 },
  ];
  const { failed, rows } = checkRegressions(baseline, current, opts);
  assert.equal(failed, true);
  assert.equal(rows.find((r) => r.codec === "JPEG XL").status, "REGRESSED");
});

test("fails when a baseline codec is missing from the results", () => {
  const current = [{ image: "a.png", codec: "JPEG XL", bytes: 1000, ssimulacra2: 90.1 }];
  const { failed, rows } = checkRegressions(baseline, current, opts);
  assert.equal(failed, true);
  assert.ok(rows.some((r) => r.codec === "AVIF" && r.status === "missing"));
});

test("marks a smaller file at the same quality as improved without failing", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 900, ssimulacra2: 90.1 },
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 89.9 },
  ];
  const { failed, rows } = checkRegressions(baseline, current, opts);
  assert.equal(failed, false);
  assert.equal(rows.find((r) => r.codec === "JPEG XL").status, "improved");
});

test("fails a smaller file whose quality dropped beyond the quality tolerance", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 900, ssimulacra2: 89.4 }, // -0.7 points
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 89.9 },
  ];
  const { failed, rows } = checkRegressions(baseline, current, opts);
  assert.equal(failed, true);
  const jxl = rows.find((r) => r.codec === "JPEG XL");
  assert.equal(jxl.status, "QUALITY");
  assert.equal(Number(jxl.deltaScore.toFixed(2)), -0.7);
});

test("tolerates a quality change within the quality tolerance", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1000, ssimulacra2: 89.7 }, // -0.4 points
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 90.3 },
  ];
  const { failed } = checkRegressions(baseline, current, opts);
  assert.equal(failed, false);
});

test("fails without comparing when the run's target differs from the baseline's", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1000, ssimulacra2: 90.1 },
    { image: "a.png", codec: "AVIF", bytes: 2000, ssimulacra2: 89.9 },
  ];
  const result = checkRegressions(baseline, current, { ...opts, target: 85 });
  assert.equal(result.failed, true);
  assert.match(result.error, /target 85.*baseline.*target 90/);
  assert.deepEqual(result.rows, []);
});

test("baselineFromRows records bytes and ssimulacra2 per image and codec", () => {
  assert.deepEqual(baselineFromRows(parseResultsCsv(csv), 90), baseline);
});
