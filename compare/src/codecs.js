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
    // to both avifenc 0.11 and 1.x (where -q is preferred).
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

/**
 * Opt-in variants: a codec already in the set with one setting changed, so a
 * comparison can isolate what that setting is worth. They reuse the base codec's
 * knob, decoder and effort mapping, and run only when named in --codecs (or with
 * --codecs all), so the default comparison and the regression baseline stay put.
 */
function variant(base, { id, name, extraArgs }) {
  return { ...base, id, name, encodeArgs: (input, output, knob) => [...extraArgs, ...base.encodeArgs(input, output, knob)] };
}

// cwebp's default RGB->YUV conversion averages each 2x2 block's chroma, which
// bleeds and darkens saturated edges (colored text, thin lines); -sharp_yuv
// solves for the luma and chroma that reconstruct the RGB best after upsampling.
CODECS["webp-sharp"] = variant(CODECS.webp, { id: "webp-sharp", name: "WebP sharp YUV", extraArgs: ["-sharp_yuv"] });

// heif-enc asks x265 for 4:2:0 by default; chroma=444 keeps full-resolution color,
// which needs the HEVC Range Extensions profile on the decoding side.
CODECS["heic-444"] = variant(CODECS.heic, { id: "heic-444", name: "HEIC 4:4:4", extraArgs: ["-p", "chroma=444"] });

// Same format, another AV1 encoder: avifenc picks aom by default, -c rav1e selects
// rav1e when libavif was built with it (avifenc --version lists the encoders).
CODECS["avif-rav1e"] = variant(CODECS.avif, { id: "avif-rav1e", name: "AVIF rav1e", extraArgs: ["-c", "rav1e"] });

// Plain libjpeg-turbo, the library mozjpeg forked: the same cjpeg command line
// with mozjpeg's improvements absent. Debian's cjpeg 2.1 does not read PNG, so the
// reference is handed over as PPM (inputExt), converted once outside the timing.
CODECS["jpeg-turbo"] = { ...CODECS.mozjpeg, id: "jpeg-turbo", name: "libjpeg-turbo", encoder: "cjpeg", inputExt: "ppm" };

export const DEFAULT_CODECS = ["jxl", "avif", "webp", "jpegli", "mozjpeg", "heic"];

/**
 * Resolve a --codecs value to codec ids: the default set when absent, every codec
 * (opt-in variants included) for "all", or the comma-separated list. Throws on an
 * unknown id, naming the known ones.
 */
export function resolveCodecIds(value) {
  if (value === undefined) return DEFAULT_CODECS;
  if (value.trim() === "all") return Object.keys(CODECS);
  const ids = value.split(",").map((s) => s.trim());
  const unknown = ids.filter((id) => !CODECS[id]);
  if (unknown.length) {
    throw new Error(`Unknown codec(s): ${unknown.join(", ")}. Known: ${Object.keys(CODECS).join(", ")}`);
  }
  return ids;
}

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
