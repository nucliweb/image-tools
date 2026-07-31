import { statSync } from "node:fs";
import { join } from "node:path";
import { run, resolveCommand } from "./exec.js";
import { ssimulacra2, dssim } from "./metrics.js";
import { searchForTarget } from "./search.js";
import { pngDimensions, writeStrippedPng } from "./image.js";

/**
 * Encode the reference at a given knob, decode back to PNG, strip the decoded
 * PNG to critical chunks (so ssimulacra2 can read every codec's output), and
 * measure it. The reference is expected to be already normalized.
 * @returns {{ score: number, bytes: number, decodedPng: string }}
 */
export function encodeDecodeMeasure(codec, referencePng, knob, workdir, tag = "") {
  const encoded = join(workdir, `${codec.id}${tag}.${codec.ext}`);
  const decodedRaw = join(workdir, `${codec.id}${tag}.dec.raw.png`);
  const decodedPng = join(workdir, `${codec.id}${tag}.dec.png`);

  run(resolveCommand(codec.encoder), codec.encodeArgs(referencePng, encoded, knob));
  run(resolveCommand(codec.decoder), codec.decodeArgs(encoded, decodedRaw));
  writeStrippedPng(decodedRaw, decodedPng);

  return {
    score: ssimulacra2(referencePng, decodedPng),
    bytes: statSync(encoded).size,
    decodedPng,
  };
}

/**
 * Search a codec's quality knob until the decoded image reaches the target
 * ssimulacra2 score, then report size and metrics at that operating point.
 *
 * @returns {{ id, name, label, knob, ssimulacra2, dssim, bytes, bpp, iterations }}
 */
export function findQualityForTarget(codec, referencePng, target, workdir, opts = {}) {
  // Normalize the reference once: strip ancillary chunks so ssimulacra2/dssim can
  // read it, and so every codec is measured against the exact same input.
  const refNorm = opts.referenceNorm ?? join(workdir, "reference.norm.png");
  if (!opts.referenceNorm) writeStrippedPng(referencePng, refNorm);
  const { pixels } = pngDimensions(refNorm);

  const search = searchForTarget({
    lo: codec.knob.lo,
    hi: codec.knob.hi,
    target,
    tolerance: opts.tolerance ?? 0.5,
    maxIterations: opts.maxIterations ?? 10,
    increasing: codec.knob.increasing,
    evaluate: (knob) => encodeDecodeMeasure(codec, refNorm, knob, workdir).score,
  });

  // Re-encode at the chosen knob to read the definitive size and decoded output.
  const final = encodeDecodeMeasure(codec, refNorm, search.value, workdir);
  const tolerance = opts.tolerance ?? 0.5;

  return {
    id: codec.id,
    name: codec.name,
    label: codec.label(search.value),
    knob: search.value,
    ssimulacra2: final.score,
    dssim: dssim(refNorm, final.decodedPng),
    bytes: final.bytes,
    bpp: (final.bytes * 8) / pixels,
    iterations: search.iterations,
    reached: Math.abs(final.score - target) <= tolerance,
  };
}
