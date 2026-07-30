import { test } from "node:test";
import assert from "node:assert/strict";
import { pngDimensions, stripPngChunks } from "../src/image.js";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Build a PNG chunk: length(4) + type(4) + data + crc(4, left as zeros here). */
function chunk(type, data = Buffer.alloc(0)) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

function fakePng(width, height, extraChunks = []) {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdrData),
    ...extraChunks,
    chunk("IDAT", Buffer.from([1, 2, 3])),
    chunk("IEND"),
  ]);
}

test("reads PNG dimensions from IHDR", () => {
  assert.deepEqual(pngDimensions(fakePng(640, 480)), {
    width: 640,
    height: 480,
    pixels: 640 * 480,
  });
});

test("strips ancillary chunks that break ssimulacra2 (e.g. cHRM), keeps critical ones", () => {
  const withChrm = fakePng(16, 16, [chunk("cHRM", Buffer.alloc(32)), chunk("gAMA", Buffer.alloc(4))]);
  const stripped = stripPngChunks(withChrm);

  assert.ok(stripped.subarray(0, 8).equals(SIGNATURE), "keeps signature");
  assert.equal(stripped.includes(Buffer.from("cHRM")), false, "drops cHRM");
  assert.equal(stripped.includes(Buffer.from("gAMA")), false, "drops gAMA");
  assert.ok(stripped.includes(Buffer.from("IHDR")), "keeps IHDR");
  assert.ok(stripped.includes(Buffer.from("IDAT")), "keeps IDAT");
  assert.ok(stripped.includes(Buffer.from("IEND")), "keeps IEND");
  // Dimensions still readable after stripping.
  assert.deepEqual(pngDimensions(stripped), { width: 16, height: 16, pixels: 256 });
});

test("keeps PLTE and tRNS (needed for palette/alpha images)", () => {
  const paletted = fakePng(4, 4, [chunk("PLTE", Buffer.alloc(6)), chunk("tRNS", Buffer.alloc(2))]);
  const stripped = stripPngChunks(paletted);
  assert.ok(stripped.includes(Buffer.from("PLTE")), "keeps PLTE");
  assert.ok(stripped.includes(Buffer.from("tRNS")), "keeps tRNS");
});
