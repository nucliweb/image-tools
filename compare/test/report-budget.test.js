import { test } from "node:test";
import assert from "node:assert/strict";
import { toBudgetTable, toBudgetAggregateTable, toBudgetCsv } from "../src/report.js";
import { aggregateBudget } from "../src/batch.js";

const timing = { encodeWallMs: 410, encodeCpuMs: 1290, totalEncodeWallMs: 1800, totalEncodeCpuMs: 5400, encodePeakBytes: 50331648 };
const results = [
  { id: "mozjpeg", name: "mozjpeg", label: "-quality 71", bytes: 49870, bpp: 1.52, ssimulacra2: 78.4, dssim: 0.0011, iterations: 7, budgetBytes: 50000, fits: true, ...timing },
  { id: "jxl", name: "JPEG XL", label: "-d 1.2", bytes: 49512, bpp: 1.51, ssimulacra2: 84.9, dssim: 0.0006, iterations: 5, budgetBytes: 50000, fits: true, ...timing },
  { id: "heic", name: "HEIC", label: "-q 1", bytes: 61000, bpp: 1.86, ssimulacra2: 88.0, dssim: 0.0004, iterations: 10, budgetBytes: 50000, fits: false, ...timing },
  { id: "avif", name: "AVIF", failed: true, error: "avifenc exited with 1" },
];
const meta = { reference: "photo.png", width: 512, height: 512, budgetBytes: 50000, budgetLabel: "50 KB" };
const rowOrder = (table, names) => names.map((n) => table.indexOf(`| ${n} `));

test("budget table ranks codecs that fit by quality, best first, then the rest", () => {
  const table = toBudgetTable(results, meta);
  const [jxl, moz, heic, avif] = rowOrder(table, ["JPEG XL", "mozjpeg", "HEIC", "AVIF"]);
  assert.ok(jxl < moz, "higher ssimulacra2 first");
  assert.ok(moz < heic, "a codec over the budget ranks after every codec that fits, whatever its score");
  assert.ok(heic < avif, "failed codecs last");
});

test("budget table states the budget in the unit asked for and in bytes", () => {
  const table = toBudgetTable(results, meta);
  assert.match(table, /photo\.png \(512×512\)/);
  assert.match(table, /Budget: 50 KB = 50,000 bytes/);
  assert.match(table, /compare quality/);
});

test("budget table shows exact sizes and the share of the budget used", () => {
  const table = toBudgetTable(results, meta);
  assert.match(table, /49,512 B/);
  assert.match(table, /99\.0%/, "JPEG XL uses 99.0% of the budget");
  assert.match(table, /122\.0% \*/, "HEIC is over the budget, flagged");
  assert.match(table, /\* cannot fit the budget/);
  assert.match(table, /† AVIF failed: avifenc exited with 1/);
});

test("budget table uses ASCII borders and keeps the timing columns", () => {
  const table = toBudgetTable(results, meta);
  assert.match(table, /\+-+\+/);
  assert.match(table, /encode .* cpu .* memory/);
});

test("budget CSV has one row per image and codec, with the budget and whether it fits", () => {
  const csv = toBudgetCsv([{ image: "photo.png", results }]);
  const [header, ...rows] = csv.split("\n");
  assert.equal(
    header,
    "image,codec,setting,budget_bytes,bytes,bpp,ssimulacra2,dssim,fits,iterations," +
      "encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms,encode_peak_rss_bytes,error",
  );
  assert.equal(rows.length, 4);
  assert.equal(rows[0], "photo.png,JPEG XL,-d 1.2,50000,49512,1.5100,84.9000,0.000600,true,5,410,1290,1800,5400,50331648,");
  assert.match(rows[2], /^photo\.png,HEIC,-q 1,50000,61000,.*,false,/);
  assert.equal(rows[3], "photo.png,AVIF,,,,,,,,,,,,,,avifenc exited with 1");
});

const fit = (id, name, ssimulacra2, fits = true) => ({ id, name, ssimulacra2, fits, bytes: 1, bpp: 1 });
// HEIC cannot fit a.png; c.png is the hard image where it is the only codec to fit.
const perImage = [
  { image: "a.png", results: [fit("jxl", "JPEG XL", 85), fit("mozjpeg", "mozjpeg", 80), fit("heic", "HEIC", 95, false)] },
  { image: "b.png", results: [fit("jxl", "JPEG XL", 75), fit("mozjpeg", "mozjpeg", 78), fit("heic", "HEIC", 90)] },
  { image: "c.png", results: [fit("jxl", "JPEG XL", 30, false), fit("mozjpeg", "mozjpeg", 20, false), fit("heic", "HEIC", 10)] },
];
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test("budget aggregate averages quality over the images where every codec fits", () => {
  // Only b.png: averaging each codec over its own images would rank them on
  // different images, rewarding a codec for not fitting the hard ones.
  const rows = byId(aggregateBudget(perImage, { baselineId: "mozjpeg" }));
  assert.equal(rows.jxl.avgScore, 75);
  assert.equal(rows.mozjpeg.avgScore, 78);
  assert.equal(rows.heic.avgScore, 90);
  assert.equal(rows.jxl.compared, 1, "names how many images the averages cover");
});

test("budget aggregate compares with the baseline over the same images", () => {
  const rows = byId(aggregateBudget(perImage, { baselineId: "mozjpeg" }));
  assert.equal(rows.jxl.deltaVsBaseline, -3);
  assert.equal(rows.heic.deltaVsBaseline, 12);
  assert.equal(rows.mozjpeg.deltaVsBaseline, 0);
});

test("budget aggregate counts wins and fits on every image", () => {
  const rows = byId(aggregateBudget(perImage, { baselineId: "mozjpeg" }));
  assert.deepEqual([rows.jxl.wins, rows.mozjpeg.wins, rows.heic.wins], [1, 0, 2], "a win needs the codec to fit");
  assert.deepEqual([rows.jxl.fits, rows.heic.fits, rows.heic.count], [2, 2, 3]);
});

test("budget aggregate is sorted by average quality, best first", () => {
  const rows = aggregateBudget(perImage, { baselineId: "mozjpeg" });
  assert.deepEqual(rows.map((r) => r.id), ["heic", "mozjpeg", "jxl"]);
});

test("budget aggregate has no averages when no image fits with every codec", () => {
  const rows = aggregateBudget([perImage[0], perImage[2]], { baselineId: "mozjpeg" });
  assert.ok(rows.every((r) => r.avgScore === null && r.deltaVsBaseline === null && r.compared === 0));
  assert.deepEqual(byId(rows).heic.wins, 1, "wins still count");
});

test("budget aggregate table names the budget, the baseline and the images compared", () => {
  const rows = aggregateBudget(perImage, { baselineId: "mozjpeg" });
  const table = toBudgetAggregateTable(rows, { imageCount: 3, budgetBytes: 50000, budgetLabel: "50 KB", baselineId: "mozjpeg", baselineName: "mozjpeg" });
  assert.match(table, /Budget summary — 3 images, budget 50 KB = 50,000 bytes/);
  assert.match(table, /the 1 of 3 images where every codec fits/);
  assert.match(table, /avg ssimulacra2/);
  assert.match(table, /vs mozjpeg/);
  assert.match(table, /\+12\.00/);
  assert.match(table, /baseline/);
  assert.match(table, /2\/3/, "HEIC fits two of three images");
});

test("budget aggregate table says so when no image fits with every codec", () => {
  const rows = aggregateBudget([perImage[0], perImage[2]], { baselineId: "mozjpeg" });
  const table = toBudgetAggregateTable(rows, { imageCount: 2, budgetBytes: 50000, budgetLabel: "50 KB", baselineId: "mozjpeg", baselineName: "mozjpeg" });
  assert.match(table, /No image fits the budget with every codec/);
});
