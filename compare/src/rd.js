/**
 * Rate-distortion analysis: each codec is searched to equal quality at several
 * targets, giving one (quality, bpp) curve per codec, and the curves are compared
 * with the Bjøntegaard delta rate (BD-rate).
 */

/**
 * Parse a comma-separated list of target scores into a sorted, de-duplicated
 * array. A curve needs at least two distinct targets.
 */
export function parseTargets(list) {
  const targets = String(list)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`--rd target "${s}" is not a number.`);
      return n;
    });
  const unique = [...new Set(targets)].sort((a, b) => a - b);
  if (unique.length < 2) throw new Error("--rd needs at least two distinct targets, e.g. 70,80,90.");
  return unique;
}

/**
 * Turn RD points into a curve of (quality, ln bpp), sorted by quality, keeping
 * one point per quality. Rate is compared in the log domain, as in BD-rate.
 */
function logCurve(points) {
  const curve = [];
  const measured = points.filter((p) => !p.failed);
  for (const p of measured.sort((a, b) => a.ssimulacra2 - b.ssimulacra2)) {
    if (curve.length && curve[curve.length - 1].q === p.ssimulacra2) continue;
    curve.push({ q: p.ssimulacra2, y: Math.log(p.bpp) });
  }
  return curve;
}

/** Linear interpolation of a log curve at quality q (q within the curve's range). */
function valueAt(curve, q) {
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (q <= b.q) return a.y + ((q - a.q) * (b.y - a.y)) / (b.q - a.q);
  }
  return curve[curve.length - 1].y;
}

/** Exact integral of a piecewise-linear curve over [lo, hi] (trapezoids between breakpoints). */
function integrate(curve, lo, hi) {
  const xs = [lo, ...curve.map((p) => p.q).filter((q) => q > lo && q < hi), hi];
  let area = 0;
  for (let i = 1; i < xs.length; i += 1) {
    area += ((xs[i] - xs[i - 1]) * (valueAt(curve, xs[i - 1]) + valueAt(curve, xs[i]))) / 2;
  }
  return area;
}

/**
 * Bjøntegaard delta rate of `test` against `anchor`: the average bit-rate
 * difference, in percent, at equal quality over the quality range both curves
 * cover. Negative means the test codec needs fewer bits. Rate is interpolated
 * piecewise-linearly in the log domain (rather than with the classic cubic fit),
 * which stays well-behaved with few points and never overshoots.
 *
 * Returns null when either curve has fewer than two distinct qualities or the
 * curves do not overlap.
 *
 * @param {Array<{ ssimulacra2: number, bpp: number }>} anchor
 * @param {Array<{ ssimulacra2: number, bpp: number }>} test
 */
export function bdRate(anchor, test) {
  const a = logCurve(anchor);
  const t = logCurve(test);
  if (a.length < 2 || t.length < 2) return null;

  const lo = Math.max(a[0].q, t[0].q);
  const hi = Math.min(a[a.length - 1].q, t[t.length - 1].q);
  if (!(hi > lo)) return null;

  const avgLogDiff = (integrate(t, lo, hi) - integrate(a, lo, hi)) / (hi - lo);
  return (Math.exp(avgLogDiff) - 1) * 100;
}

/**
 * BD-rate of every codec of one image against the baseline codec.
 * @param {Array<{ id: string, points: Array<object> }>} codecs
 * @returns {Map<string, number | null>} null when the codec could not be rated.
 */
export function imageBdRates(codecs, baselineId) {
  const baseline = codecs.find((c) => c.id === baselineId);
  return new Map(codecs.map((c) => [c.id, baseline ? bdRate(baseline.points, c.points) : null]));
}

/**
 * Mean BD-rate per codec across a batch of images, ignoring images where a codec
 * could not be rated. Sorted best (most negative) first; unrated codecs last.
 *
 * @param {Array<{ codecs: Array<{ id: string, name: string, points: Array<object> }> }>} perImage
 * @returns {Array<{ id, name, meanBdRate: number | null, rated: number, count: number }>}
 */
export function aggregateBdRates(perImage, baselineId) {
  const byId = new Map();
  for (const { codecs } of perImage) {
    const rates = imageBdRates(codecs, baselineId);
    for (const c of codecs) {
      let entry = byId.get(c.id);
      if (!entry) {
        entry = { id: c.id, name: c.name, rates: [], count: 0 };
        byId.set(c.id, entry);
      }
      entry.count += 1;
      const rate = rates.get(c.id);
      if (rate !== null) entry.rates.push(rate);
    }
  }

  const rank = (r) => (r.meanBdRate === null ? Infinity : r.meanBdRate);
  return [...byId.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      meanBdRate: e.rates.length ? e.rates.reduce((s, n) => s + n, 0) / e.rates.length : null,
      rated: e.rates.length,
      count: e.count,
    }))
    .sort((a, b) => rank(a) - rank(b));
}
