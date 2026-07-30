/**
 * Binary-search a quality knob until a measured score reaches a target.
 *
 * The score is assumed monotonic in the knob: `increasing: true` when a higher
 * knob yields a higher score (e.g. avifenc/cwebp `-q`), and `false` when a higher
 * knob yields a lower score (e.g. cjxl/cjpegli `-d` distance).
 *
 * Returns the evaluation closest to the target seen during the search, so a target
 * outside the achievable range resolves to the nearest bound.
 *
 * @param {object} opts
 * @param {number} opts.lo            Lower bound of the knob.
 * @param {number} opts.hi            Upper bound of the knob.
 * @param {number} opts.target        Score to aim for.
 * @param {number} [opts.tolerance]   Stop once |score - target| <= tolerance.
 * @param {number} [opts.maxIterations]
 * @param {boolean} [opts.increasing] Whether the score increases with the knob.
 * @param {(knob: number) => number} opts.evaluate  Measures the score at a knob value.
 * @returns {{ value: number, score: number, iterations: number }}
 */
export function searchForTarget({
  lo,
  hi,
  target,
  tolerance = 0.5,
  maxIterations = 12,
  increasing = true,
  evaluate,
}) {
  let best = null;

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (lo + hi) / 2;
    const score = evaluate(mid);

    if (best === null || Math.abs(score - target) < Math.abs(best.score - target)) {
      best = { value: mid, score, iterations: i + 1 };
    }

    if (Math.abs(score - target) <= tolerance) break;

    const scoreTooLow = increasing ? score < target : score > target;
    if (scoreTooLow) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}
