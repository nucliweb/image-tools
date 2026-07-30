import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarkdownTable, toCsv } from "../src/report.js";

const results = [
  { name: "AVIF", label: "-q 87", bytes: 55966, bpp: 1.708, ssimulacra2: 90.46, dssim: 0.00033, iterations: 7 },
  { name: "JPEG XL", label: "-d 0.86", bytes: 41822, bpp: 1.276, ssimulacra2: 89.83, dssim: 0.0004, iterations: 5 },
];

const meta = { reference: "photo.png", width: 512, height: 512, target: 90 };

test("markdown table is sorted by size ascending (smallest first)", () => {
  const md = toMarkdownTable(results, meta);
  const jxlIndex = md.indexOf("JPEG XL");
  const avifIndex = md.indexOf("AVIF");
  assert.ok(jxlIndex < avifIndex, "smaller JPEG XL should come before AVIF");
});

test("markdown includes a header with reference and target", () => {
  const md = toMarkdownTable(results, meta);
  assert.match(md, /photo\.png/);
  assert.match(md, /512.*512/);
  assert.match(md, /90/);
  assert.match(md, /ssimulacra2/);
});

test("csv has a header row and one row per result, sorted by size", () => {
  const csv = toCsv(results);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "codec,setting,bytes,bpp,ssimulacra2,dssim,iterations");
  assert.match(lines[1], /^JPEG XL,-d 0\.86,41822,/);
  assert.match(lines[2], /^AVIF,-q 87,55966,/);
});
