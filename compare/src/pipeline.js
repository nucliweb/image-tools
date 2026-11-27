import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { run, runTimed, resolveCommand } from "./exec.js";
import { buildEncodeArgs } from "./codecs.js";
import { ssimulacra2, dssim } from "./metrics.js";
import { searchForTarget, searchForBudget } from "./search.js";
import { pngDimensions, writeStrippedPng } from "./image.js";

/**
 * The file a codec's encoder reads: the reference PNG itself, or, for a codec that
 * declares another inputExt (an encoder without PNG support), a lossless copy in
 * that format next to it, converted once with vips and reused across encodes.
 */
export function encoderInput(codec, referencePng) {
  if (!codec.inputExt) return referencePng;
  const converted = referencePng.replace(/\.png$/i, "") + `.${codec.inputExt}`;
  if (!existsSync(converted)) run(resolveCommand("vips"), ["copy", referencePng, converted]);
  return converted;
}

/**
 * Encode the reference at a given knob and read the encoded size, timing the
 * encoder (wall and CPU) and its peak memory.
 * @returns {{ encoded, bytes, encodeWallMs, encodeCpuMs, encodePeakBytes }}
 */
function encodeAt(codec, referencePng, knob, workdir, tag, effort) {
  const encoded = join(workdir, `${codec.id}${tag}.${codec.ext}`);
  const timing = runTimed(resolveCommand(codec.encoder), buildEncodeArgs(codec, encoderInput(codec, referencePng), encoded, knob, effort));
  return {
    encoded,
    bytes: statSync(encoded).size,
    encodeWallMs: timing.wallMs,
    encodeCpuMs: timing.cpuMs,
    encodePeakBytes: timing.peakBytes,
  };
}

/**
 * Encode the reference at a given knob, decode back to PNG, strip the decoded
 * PNG to critical chunks (so ssimulacra2 can read every codec's output), and
 * measure it. The reference is expected to be already normalized.
 * Timing (wall and CPU) and peak memory are measured for the encode step only,
 * since that is the codec's own cost; decoding and metrics are the harness's
 * measurement tools.
 * @returns {{ score, bytes, decodedPng, encodeWallMs, encodeCpuMs, encodePeakBytes }}
 */
export function encodeDecodeMeasure(codec, referencePng, knob, workdir, tag = "", effort = null) {
  const decodedRaw = join(workdir, `${codec.id}${tag}.dec.raw.png`);
  const decodedPng = join(workdir, `${codec.id}${tag}.dec.png`);

  const { encoded, ...encode } = encodeAt(codec, referencePng, knob, workdir, tag, effort);
  run(resolveCommand(codec.decoder), codec.decodeArgs(encoded, decodedRaw));
  writeStrippedPng(decodedRaw, decodedPng);

  return { score: ssimulacra2(referencePng, decodedPng), decodedPng, ...encode };
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
 * Peak memory is the largest of the runs, the most an encode needed.
 * @returns {{ wallMs: number | null, cpuMs: number | null, peakBytes: number | null }}
 */
export function medianEncodeTiming(codec, referencePng, knob, workdir, runs, effort = null) {
  const encoded = join(workdir, `${codec.id}.timing.${codec.ext}`);
  const wall = [];
  const cpu = [];
  const peak = [];
  for (let i = 0; i < runs; i++) {
    const t = runTimed(resolveCommand(codec.encoder), buildEncodeArgs(codec, encoderInput(codec, referencePng), encoded, knob, effort));
    wall.push(t.wallMs);
    cpu.push(t.cpuMs);
    peak.push(t.peakBytes);
  }
  const peakBytes = peak.some((p) => p === null) ? null : Math.max(...peak);
  return { wallMs: median(wall), cpuMs: median(cpu), peakBytes };
}

/**
 * Normalize the reference once, unless the caller already did: strip ancillary
 * chunks so ssimulacra2/dssim can read it, and so every codec is measured against
 * the exact same input.
 */
function normalizedReference(referencePng, workdir, opts) {
  if (opts.referenceNorm) return opts.referenceNorm;
  const refNorm = join(workdir, "reference.norm.png");
  writeStrippedPng(referencePng, refNorm);
  return refNorm;
}

/**
 * Accumulate the encoder's own time across every encode a search performs, plus
 * the final one, for a per-codec "total encode effort". If any sample is missing
 * (no /usr/bin/time) the total is reported as null rather than an undercount.
 */
function encodeEffort() {
  let wallMs = 0;
  let cpuMs = 0;
  let complete = true;
  return {
    add(m) {
      if (m.encodeWallMs === null || m.encodeCpuMs === null) complete = false;
      else {
        wallMs += m.encodeWallMs;
        cpuMs += m.encodeCpuMs;
      }
    },
    totals: () => ({ totalEncodeWallMs: complete ? wallMs : null, totalEncodeCpuMs: complete ? cpuMs : null }),
  };
}

/**
 * Re-encode at the chosen knob to read the definitive size and decoded output,
 * time it, and assemble the fields both searches report.
 *
 * Timing reuses the final encode's sample for the default single run (no extra
 * work); for more runs, it re-times the encode and reports the median to cut noise.
 */
function measureOperatingPoint(codec, refNorm, knob, workdir, effort, iterations, effortLog, opts) {
  const final = encodeDecodeMeasure(codec, refNorm, knob, workdir, "", effort);
  effortLog.add(final);

  const timeRuns = Math.max(1, Math.floor(opts.timeRuns ?? 1));
  const timing =
    timeRuns > 1
      ? medianEncodeTiming(codec, refNorm, knob, workdir, timeRuns, effort)
      : { wallMs: final.encodeWallMs, cpuMs: final.encodeCpuMs, peakBytes: final.encodePeakBytes };

  return {
    id: codec.id,
    name: codec.name,
    label: codec.label(knob),
    knob,
    ssimulacra2: final.score,
    dssim: dssim(refNorm, final.decodedPng),
    bytes: final.bytes,
    bpp: (final.bytes * 8) / pngDimensions(refNorm).pixels,
    iterations,
    decodedPng: final.decodedPng,
    encodeWallMs: timing.wallMs,
    encodeCpuMs: timing.cpuMs,
    encodePeakBytes: timing.peakBytes,
    ...effortLog.totals(),
  };
}

/**
 * Search a codec's quality knob until the decoded image reaches the target
 * ssimulacra2 score, then report size and metrics at that operating point.
 *
 * @returns {{ id, name, label, knob, ssimulacra2, dssim, bytes, bpp, iterations, reached,
 *   decodedPng, encodeWallMs, encodeCpuMs, encodePeakBytes, totalEncodeWallMs, totalEncodeCpuMs }}
 */
export function findQualityForTarget(codec, referencePng, target, workdir, opts = {}) {
  const refNorm = normalizedReference(referencePng, workdir, opts);
  const effort = opts.effort ?? null;
  const tolerance = opts.tolerance ?? 0.5;
  const effortLog = encodeEffort();

  const search = searchForTarget({
    lo: codec.knob.lo,
    hi: codec.knob.hi,
    target,
    tolerance,
    maxIterations: opts.maxIterations ?? 10,
    increasing: codec.knob.increasing,
    evaluate: (knob) => {
      const m = encodeDecodeMeasure(codec, refNorm, knob, workdir, "", effort);
      effortLog.add(m);
      return m.score;
    },
  });

  const op = measureOperatingPoint(codec, refNorm, search.value, workdir, effort, search.iterations, effortLog, opts);
  return { ...op, reached: Math.abs(op.ssimulacra2 - target) <= tolerance };
}

/**
 * Search a codec's quality knob for the largest file that fits a byte budget,
 * then report the quality it reaches there: the inverse of findQualityForTarget,
 * comparing codecs at equal size instead of equal quality.
 *
 * The search only needs the encoded size, so it encodes without decoding or
 * measuring; the decode and the metrics run once, at the chosen setting.
 *
 * @returns {{ ...findQualityForTarget's fields except reached, budgetBytes: number,
 *   fits: boolean }} `fits` is false when even the lowest quality is over budget.
 */
export function findQualityForBudget(codec, referencePng, budgetBytes, workdir, opts = {}) {
  const refNorm = normalizedReference(referencePng, workdir, opts);
  const effort = opts.effort ?? null;
  const effortLog = encodeEffort();

  const search = searchForBudget({
    lo: codec.knob.lo,
    hi: codec.knob.hi,
    budget: budgetBytes,
    maxIterations: opts.maxIterations ?? 10,
    increasing: codec.knob.increasing,
    evaluate: (knob) => {
      const m = encodeAt(codec, refNorm, knob, workdir, "", effort);
      effortLog.add(m);
      return m.bytes;
    },
  });

  const op = measureOperatingPoint(codec, refNorm, search.value, workdir, effort, search.iterations, effortLog, opts);
  return { ...op, budgetBytes, fits: op.bytes <= budgetBytes };
}
