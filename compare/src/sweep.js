import { encodeDecodeMeasure } from "./pipeline.js";
import { dssim } from "./metrics.js";

/**
 * Encode a codec at each of its sweep knob points, decode and measure each, to
 * build a rate-distortion curve (size vs quality). Points are returned sorted by
 * ascending ssimulacra2. Each point keeps the decoded PNG path so a preview can
 * be embedded later.
 */
export function sweepCodec(codec, refNorm, pixels, workdir) {
  const points = codec.sweep.map((knob, i) => {
    const m = encodeDecodeMeasure(codec, refNorm, knob, workdir, `.s${i}`);
    return {
      knob,
      label: codec.label(knob),
      bytes: m.bytes,
      bpp: (m.bytes * 8) / pixels,
      ssimulacra2: m.score,
      dssim: dssim(refNorm, m.decodedPng),
      decodedPng: m.decodedPng,
    };
  });
  points.sort((a, b) => a.ssimulacra2 - b.ssimulacra2);
  return { id: codec.id, name: codec.name, points };
}

/** The point whose ssimulacra2 is closest to the target. */
export function nearestPoint(points, target) {
  return points.reduce((best, p) =>
    Math.abs(p.ssimulacra2 - target) < Math.abs(best.ssimulacra2 - target) ? p : best,
  );
}
