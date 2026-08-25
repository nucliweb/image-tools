/**
 * Per-codec configuration for the comparison harness.
 *
 * Each codec exposes a single quality "knob" that is monotonic against perceptual
 * score, so the harness can binary-search it to an equal target:
 *   - cjxl / cjpegli use `-d` (butteraugli distance): lower distance, higher quality.
 *   - avifenc / cwebp use `-q` (0..100): higher quality value, higher quality.
 */

const round2 = (n) => Number(n.toFixed(2));
const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

export const CODECS = {
  jxl: {
    id: "jxl",
    name: "JPEG XL",
    ext: "jxl",
    encoder: "cjxl",
    decoder: "djxl",
    knob: { lo: 0.4, hi: 15, increasing: false, integer: false },
    sweep: [5, 3, 2, 1, 0.5],
    label: (knob) => `-d ${round2(knob)}`,
    encodeArgs: (input, output, knob) => [input, output, "-d", String(round2(knob))],
    decodeArgs: (input, outputPng) => [input, outputPng],
    // cjxl -e is 1..10 (higher = more effort); options follow the positionals.
    effortPlacement: "post",
    effortArgs: (level) => ["-e", String(clampInt(level, 1, 10))],
  },

  jpegli: {
    id: "jpegli",
    name: "jpegli",
    ext: "jpg",
    encoder: "cjpegli",
    decoder: "djpegli",
    knob: { lo: 0.4, hi: 15, increasing: false, integer: false },
    sweep: [5, 3, 2, 1, 0.5],
    label: (knob) => `-d ${round2(knob)}`,
    encodeArgs: (input, output, knob) => [input, output, "-d", String(round2(knob))],
    decodeArgs: (input, outputPng) => [input, outputPng],
  },

  avif: {
    id: "avif",
    name: "AVIF",
    ext: "avif",
    encoder: "avifenc",
    decoder: "avifdec",
    // Use the color quantizer (0..63, 0 = lossless), the only quality knob common
    // to both avifenc 0.11 (Debian) and 1.x (Homebrew, where -q is preferred).
    // Higher quantizer means lower quality, so the score decreases with the knob.
    knob: { lo: 0, hi: 63, increasing: false, integer: true },
    sweep: [45, 35, 28, 20, 12],
    label: (knob) => `--min/max ${Math.round(knob)}`,
    encodeArgs: (input, output, knob) => {
      const q = String(Math.round(knob));
      return ["--min", q, "--max", q, input, output];
    },
    decodeArgs: (input, outputPng) => [input, outputPng],
    // avifenc -s is 0..10 but inverted (0 = slowest), so more effort = lower speed.
    effortPlacement: "pre",
    effortArgs: (level) => ["-s", String(clampInt(10 - level, 0, 10))],
  },

  webp: {
    id: "webp",
    name: "WebP",
    ext: "webp",
    encoder: "cwebp",
    decoder: "dwebp",
    knob: { lo: 1, hi: 100, increasing: true, integer: true },
    sweep: [50, 65, 78, 88, 96],
    label: (knob) => `-q ${Math.round(knob)}`,
    encodeArgs: (input, output, knob) => ["-q", String(Math.round(knob)), input, "-o", output],
    decodeArgs: (input, outputPng) => [input, "-o", outputPng],
    // cwebp -m is the 0..6 compression method (higher = slower); options lead.
    effortPlacement: "pre",
    effortArgs: (level) => ["-m", String(clampInt((level * 6) / 10, 0, 6))],
  },

  mozjpeg: {
    id: "mozjpeg",
    name: "mozjpeg",
    ext: "jpg",
    // mozjpeg's cjpeg is keg-only on macOS (full path) and installed as
    // `mozjpeg-cjpeg` in the image; the first candidate that exists wins.
    encoder: ["mozjpeg-cjpeg", "/opt/homebrew/opt/mozjpeg/bin/cjpeg"],
    decoder: "djpegli", // decodes any baseline JPEG to PNG
    knob: { lo: 1, hi: 100, increasing: true, integer: true },
    sweep: [55, 70, 80, 88, 95],
    label: (knob) => `-quality ${Math.round(knob)}`,
    encodeArgs: (input, output, knob) => [
      "-quality",
      String(Math.round(knob)),
      "-outfile",
      output,
      input,
    ],
    decodeArgs: (input, outputPng) => [input, outputPng],
  },

  heic: {
    id: "heic",
    name: "HEIC",
    ext: "heic",
    encoder: "heif-enc",
    decoder: "heif-convert", // present in both macOS and the image (heif-dec is not)
    knob: { lo: 1, hi: 100, increasing: true, integer: true },
    sweep: [40, 55, 70, 82, 92],
    label: (knob) => `-q ${Math.round(knob)}`,
    encodeArgs: (input, output, knob) => [input, "-q", String(Math.round(knob)), "-o", output],
    decodeArgs: (input, outputPng) => [input, outputPng],
  },
};

export const DEFAULT_CODECS = ["jxl", "avif", "webp", "jpegli", "mozjpeg", "heic"];

/** Codecs that expose an effort/speed knob, so --effort applies to them. */
export const EFFORT_CODECS = Object.values(CODECS)
  .filter((c) => c.effortArgs)
  .map((c) => c.name);

/**
 * Build the encoder argument list for a knob, optionally injecting a normalized
 * effort level (0..10, higher = more effort). Codecs without an effort knob ignore
 * it; the extra args go before or after the base args per the codec's placement,
 * since some tools take options before the positional paths and others after.
 */
export function buildEncodeArgs(codec, input, output, knob, effort) {
  const base = codec.encodeArgs(input, output, knob);
  if (effort === null || effort === undefined || !codec.effortArgs) return base;
  const extra = codec.effortArgs(effort);
  return codec.effortPlacement === "post" ? [...base, ...extra] : [...extra, ...base];
}
