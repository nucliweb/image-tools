import { readFileSync, writeFileSync } from "node:fs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Chunks to keep. Everything else (cHRM, gAMA, iCCP, sRGB, pHYs, tEXt, ...) is
// dropped: some decoders (notably avifdec) emit a cHRM chunk that ssimulacra2's
// PNG reader rejects with "Could not decode image".
const KEEP_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

/**
 * Read a PNG's pixel dimensions straight from its IHDR chunk.
 * Width and height are big-endian uint32 at byte offsets 16 and 20.
 *
 * @param {string | Buffer} pngPathOrBuffer
 * @returns {{ width: number, height: number, pixels: number }}
 */
export function pngDimensions(pngPathOrBuffer) {
  const buf = Buffer.isBuffer(pngPathOrBuffer)
    ? pngPathOrBuffer
    : readFileSync(pngPathOrBuffer);

  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG file");
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, pixels: width * height };
}

/**
 * Return a copy of a PNG containing only critical chunks, so metric tools with
 * strict PNG readers can decode it. Chunks are copied verbatim (CRCs preserved).
 *
 * @param {string | Buffer} pngPathOrBuffer
 * @returns {Buffer}
 */
export function stripPngChunks(pngPathOrBuffer) {
  const buf = Buffer.isBuffer(pngPathOrBuffer)
    ? pngPathOrBuffer
    : readFileSync(pngPathOrBuffer);

  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG file");
  }

  const parts = [PNG_SIGNATURE];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const dataLength = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + dataLength; // length + type + data + crc
    if (KEEP_CHUNKS.has(type)) {
      parts.push(buf.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (type === "IEND") break;
  }
  return Buffer.concat(parts);
}

/** Read a PNG, strip it to critical chunks, and write the result. */
export function writeStrippedPng(srcPath, dstPath) {
  writeFileSync(dstPath, stripPngChunks(srcPath));
}

/** Read a PNG file and return it as a base64 data URI. */
export function pngDataUri(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
