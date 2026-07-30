import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectImages, aggregate } from "../src/batch.js";

test("collectImages expands directories to PNGs and keeps files", () => {
  const dir = mkdtempSync(join(tmpdir(), "batch-"));
  try {
    writeFileSync(join(dir, "a.png"), "");
    writeFileSync(join(dir, "b.PNG"), "");
    writeFileSync(join(dir, "notes.txt"), "");
    const single = join(dir, "a.png");

    assert.deepEqual(collectImages([dir]), [join(dir, "a.png"), join(dir, "b.PNG")]);
    assert.deepEqual(collectImages([single]), [single]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const perImage = [
  {
    image: "one.png",
    results: [
      { id: "jxl", name: "JPEG XL", bytes: 100, bpp: 1.0, reached: true },
      { id: "mozjpeg", name: "mozjpeg", bytes: 200, bpp: 2.0, reached: true },
    ],
  },
  {
    image: "two.png",
    results: [
      { id: "jxl", name: "JPEG XL", bytes: 150, bpp: 1.5, reached: true },
      { id: "mozjpeg", name: "mozjpeg", bytes: 250, bpp: 2.5, reached: false },
    ],
  },
];

test("aggregate computes avg bpp, wins, savings and reached, sorted by avg bpp", () => {
  const rows = aggregate(perImage, { baselineId: "mozjpeg" });

  assert.equal(rows[0].id, "jxl", "smallest avg bpp first");
  assert.equal(rows[0].avgBpp, 1.25);
  assert.equal(rows[0].wins, 2);
  assert.equal(rows[0].reached, 2);
  assert.equal(rows[0].savingsPct, 45); // mean of 50% and 40%

  const moz = rows.find((r) => r.id === "mozjpeg");
  assert.equal(moz.avgBpp, 2.25);
  assert.equal(moz.wins, 0);
  assert.equal(moz.reached, 1); // reached target in only one image
  assert.equal(moz.savingsPct, 0); // baseline vs itself
});
