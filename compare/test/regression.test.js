import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv, checkRegressions } from "../src/regression.js";

const csv = [
  "image,codec,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations,encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms",
  "a.png,JPEG XL,-d 0.6,1000,1.0,90,0.0003,true,6,10,10,50,50",
  "a.png,AVIF,--min/max 6,2000,2.0,90,0.0003,true,5,10,10,50,50",
].join("\n");

const baseline = { target: 90, images: { "a.png": { "JPEG XL": 1000, AVIF: 2000 } } };

test("parseResultsCsv extracts image, codec and bytes", () => {
  assert.deepEqual(parseResultsCsv(csv), [
    { image: "a.png", codec: "JPEG XL", bytes: 1000 },
    { image: "a.png", codec: "AVIF", bytes: 2000 },
  ]);
});

test("passes when sizes are within tolerance (smaller or a hair larger)", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1015 }, // +1.5%, within 2%
    { image: "a.png", codec: "AVIF", bytes: 1990 }, // smaller
  ];
  const { failed } = checkRegressions(baseline, current, 0.02);
  assert.equal(failed, false);
});

test("fails when a codec grows beyond tolerance", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 1030 }, // +3%, over 2%
    { image: "a.png", codec: "AVIF", bytes: 2000 },
  ];
  const { failed, rows } = checkRegressions(baseline, current, 0.02);
  assert.equal(failed, true);
  assert.equal(rows.find((r) => r.codec === "JPEG XL").status, "REGRESSED");
});

test("fails when a baseline codec is missing from the results", () => {
  const current = [{ image: "a.png", codec: "JPEG XL", bytes: 1000 }];
  const { failed, rows } = checkRegressions(baseline, current, 0.02);
  assert.equal(failed, true);
  assert.ok(rows.some((r) => r.codec === "AVIF" && r.status === "missing"));
});

test("marks a smaller file as improved without failing", () => {
  const current = [
    { image: "a.png", codec: "JPEG XL", bytes: 900 },
    { image: "a.png", codec: "AVIF", bytes: 2000 },
  ];
  const { failed, rows } = checkRegressions(baseline, current, 0.02);
  assert.equal(failed, false);
  assert.equal(rows.find((r) => r.codec === "JPEG XL").status, "improved");
});
