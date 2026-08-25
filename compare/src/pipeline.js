import { statSync } from "node:fs";
import { join } from "node:path";
import { run, runTimed, resolveCommand } from "./exec.js";
import { ssimulacra2, dssim } from "./metrics.js";
import { searchForTarget } from "./search.js";
import { pngDimensions, writeStrippedPng } from "./image.js";

/**
 * Encode the reference at a given knob, decode back to PNG, strip the decoded
 * PNG to critical chunks (so ssimulacra2 can read every codec's output), and
 * measure it. The reference is expected to be already normalized.
 * Timing (wall and CPU) is measured for the encode step only, since that is the
 * codec's own cost; decoding and metrics are the harness's measurement tools.
 * @returns {{ score, bytes, decodedPng, encodeWallMs, encodeCpuMs }}
 */
export function encodeDecodeMeasure(codec, referencePng, knob, workdir, tag = "") {
  const encoded = join(workdir, `${codec.id}${tag}.${codec.ext}`);
  const decodedRaw = join(workdir, `${codec.id}${tag}.dec.raw.png`);
  const decodedPng = join(workdir, `${codec.id}${tag}.dec.png`);

  const timing = runTimed(resolveCommand(codec.encoder), codec.encodeArgs(referencePng, encoded, knob));
  run(resolveCommand(codec.decoder), codec.decodeArgs(encoded, decodedRaw));
  writeStrippedPng(decodedRaw, decodedPng);

  return {
    score: ssimulacra2(referencePng, decodedPng),
    bytes: statSync(encoded).size,
    decodedPng,
    encodeWallMs: timing.wallMs,
    encodeCpuMs: timing.cpuMs,
  };
}

/**
 * Median of a list of numbers. Returns null if the list is empty or any sample is
 * missing, so timing that could not be measured propagates as null rather than NaN.
 */
export function median(values) {
  if (values.length === 0 || values.some((v) => v === null || v === undefined)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Time the codec's encode at a knob `runs` times and return the median wall and
 * CPU time. Repeating and taking the median damps the run-to-run noise of a single
 * timing sample (scheduling, cache state); the median rejects the odd outlier.
 * @returns {{ wallMs: number | null, cpuMs: number | null }}
 */
export function medianEncodeTiming(codec, referencePng, knob, workdir, runs) {
  const encoded = join(workdir, `${codec.id}.timing.${codec.ext}`);
  const wall = [];
  const cpu = [];
  for (let i = 0; i < runs; i++) {
    const t = runTimed(resolveCommand(codec.encoder), codec.encodeArgs(referencePng, encoded, knob));
    wall.push(t.wallMs);
    cpu.push(t.cpuMs);
  }
  return { wallMs: median(wall), cpuMs: median(cpu) };
}

/**
 * Search a codec's quality knob until the decoded image reaches the target
 * ssimulacra2 score, then report size and metrics at that operating point.
 *
 * @returns {{ id, name, label, knob, ssimulacra2, dssim, bytes, bpp, iterations, reached,
 *   encodeWallMs, encodeCpuMs, totalEncodeWallMs, totalEncodeCpuMs }}
 */
export function findQualityForTarget(codec, referencePng, target, workdir, opts = {}) {
  // Normalize the reference once: strip ancillary chunks so ssimulacra2/dssim can
  // read it, and so every codec is measured against the exact same input.
  const refNorm = opts.referenceNorm ?? join(workdir, "reference.norm.png");
  if (!opts.referenceNorm) writeStrippedPng(referencePng, refNorm);
  const { pixels } = pngDimensions(refNorm);

  // Accumulate the encoder's own time across every encode the search performs, plus
  // the final one, for a per-codec "total encode effort". If any sample is missing
  // (no /usr/bin/time) the total is reported as null rather than an undercount.
  let totalWallMs = 0;
  let totalCpuMs = 0;
  let timingComplete = true;
  const addEncode = (m) => {
    if (m.encodeWallMs === null || m.encodeCpuMs === null) timingComplete = false;
    else {
      totalWallMs += m.encodeWallMs;
      totalCpuMs += m.encodeCpuMs;
    }
  };

  const search = searchForTarget({
    lo: codec.knob.lo,
    hi: codec.knob.hi,
    target,
    tolerance: opts.tolerance ?? 0.5,
    maxIterations: opts.maxIterations ?? 10,
    increasing: codec.knob.increasing,
    evaluate: (knob) => {
      const m = encodeDecodeMeasure(codec, refNorm, knob, workdir);
      addEncode(m);
      return m.score;
    },
  });

  // Re-encode at the chosen knob to read the definitive size and decoded output.
  const final = encodeDecodeMeasure(codec, refNorm, search.value, workdir);
  addEncode(final);
  const tolerance = opts.tolerance ?? 0.5;

  // Timing: reuse the final encode's sample for the default single run (no extra
  // work); for more runs, re-time the encode and report the median to cut noise.
  const timeRuns = Math.max(1, Math.floor(opts.timeRuns ?? 1));
  const timing =
    timeRuns > 1
      ? medianEncodeTiming(codec, refNorm, search.value, workdir, timeRuns)
      : { wallMs: final.encodeWallMs, cpuMs: final.encodeCpuMs };

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
    encodeWallMs: timing.wallMs,
    encodeCpuMs: timing.cpuMs,
    totalEncodeWallMs: timingComplete ? totalWallMs : null,
    totalEncodeCpuMs: timingComplete ? totalCpuMs : null,
  };
}
