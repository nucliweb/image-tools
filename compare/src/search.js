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

/**
 * Binary-search a quality knob for the largest encoded size that fits a byte
 * budget. The size is assumed monotonic in the knob in the same direction as the
 * score (`increasing` as for searchForTarget), since a higher quality costs bytes.
 *
 * The constraint is one-sided: an evaluation over the budget is never returned
 * while one under it has been seen. When nothing fits, the smallest file seen is
 * returned with `fits: false`, so a budget below the codec's range resolves to its
 * lowest-quality end.
 *
 * @param {object} opts
 * @param {number} opts.lo
 * @param {number} opts.hi
 * @param {number} opts.budget        Maximum size in bytes.
 * @param {number} [opts.tolerance]   Stop once the size is within this many bytes
 *                                    under the budget (default: 1% of the budget).
 * @param {number} [opts.maxIterations]
 * @param {boolean} [opts.increasing] Whether the size increases with the knob.
 * @param {(knob: number) => number} opts.evaluate  Encodes at a knob, returns bytes.
 * @returns {{ value: number, bytes: number, iterations: number, fits: boolean }}
 */
export function searchForBudget({
  lo,
  hi,
  budget,
  tolerance = budget * 0.01,
  maxIterations = 12,
  increasing = true,
  evaluate,
}) {
  let best = null;

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (lo + hi) / 2;
    const bytes = evaluate(mid);
    const fits = bytes <= budget;

    const better = fits
      ? best === null || !best.fits || bytes > best.bytes
      : best === null || (!best.fits && bytes < best.bytes);
    if (better) best = { value: mid, bytes, iterations: i + 1, fits };

    if (fits && budget - bytes <= tolerance) break;

    // Under the budget there is room for more quality; over it, less.
    const raiseKnob = increasing === fits;
    if (raiseKnob) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}
