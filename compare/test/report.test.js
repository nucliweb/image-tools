import { test } from "node:test";
import assert from "node:assert/strict";
import { toComparisonTable, toAggregateTable, toCsv } from "../src/report.js";

const results = [
  { name: "AVIF", label: "-q 87", bytes: 55966, bpp: 1.708, ssimulacra2: 90.46, dssim: 0.00033, iterations: 7, encodeWallMs: 410, encodeCpuMs: 1290, totalEncodeWallMs: 1800, totalEncodeCpuMs: 5400 },
  { name: "JPEG XL", label: "-d 0.86", bytes: 41822, bpp: 1.276, ssimulacra2: 89.83, dssim: 0.0004, iterations: 5, encodeWallMs: 842, encodeCpuMs: 1560, totalEncodeWallMs: 4200, totalEncodeCpuMs: 7800 },
];

const meta = { reference: "photo.png", width: 512, height: 512, target: 90 };

test("comparison table is sorted by size ascending (smallest first)", () => {
  const table = toComparisonTable(results, meta);
  assert.ok(table.indexOf("JPEG XL") < table.indexOf("AVIF"), "smaller JPEG XL should come before AVIF");
});

test("comparison table includes a header with reference and target", () => {
  const table = toComparisonTable(results, meta);
  assert.match(table, /photo\.png/);
  assert.match(table, /512.*512/);
  assert.match(table, /90/);
  assert.match(table, /ssimulacra2/);
});

test("comparison table uses ASCII borders, not markdown pipes", () => {
  const table = toComparisonTable(results, meta);
  assert.match(table, /\+-+\+/, "expected an ASCII +---+ border row");
  assert.doesNotMatch(table, /\|\s*---\s*\|/, "should not contain a markdown separator row");
});

test("aggregate table uses ASCII borders and names the baseline", () => {
  const rows = [
    { id: "jxl", name: "JPEG XL", avgBpp: 1.2, savingsPct: 12.3, wins: 2, reached: 3, count: 3 },
    { id: "avif", name: "AVIF", avgBpp: 1.5, savingsPct: null, wins: 1, reached: 2, count: 3 },
  ];
  const table = toAggregateTable(rows, { imageCount: 3, target: 90, baselineName: "mozjpeg" });
  assert.match(table, /\+-+\+/, "expected an ASCII +---+ border row");
  assert.match(table, /Batch summary/);
  assert.match(table, /savings vs mozjpeg/);
});

test("comparison table shows encode wall time and cpu time", () => {
  const table = toComparisonTable(results, meta);
  assert.match(table, /encode/, "expected an encode (wall time) column");
  assert.match(table, /cpu/, "expected a cpu time column");
  assert.match(table, /410 ms/, "AVIF wall time formatted in ms");
  assert.match(table, /1\.56 s/, "JPEG XL cpu time formatted in seconds");
});

test("comparison table shows total encode effort across all iterations", () => {
  const table = toComparisonTable(results, meta);
  assert.match(table, /enc total/, "expected a total encode wall column");
  assert.match(table, /cpu total/, "expected a total encode cpu column");
  assert.match(table, /4\.20 s/, "JPEG XL total wall effort in seconds");
  assert.match(table, /5\.40 s/, "AVIF total cpu effort in seconds");
});

test("comparison table shows n/a when timing is unavailable", () => {
  const untimed = [{ ...results[1], encodeWallMs: null, encodeCpuMs: null }];
  const table = toComparisonTable(untimed, meta);
  assert.match(table, /n\/a/);
});

test("csv has a header row and one row per result, sorted by size", () => {
  const csv = toCsv(results);
  const lines = csv.trim().split("\n");
  assert.equal(
    lines[0],
    "codec,setting,bytes,bpp,ssimulacra2,dssim,iterations,encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms",
  );
  assert.match(lines[1], /^JPEG XL,-d 0\.86,41822,.*,842,1560,4200,7800$/);
  assert.match(lines[2], /^AVIF,-q 87,55966,.*,410,1290,1800,5400$/);
});
