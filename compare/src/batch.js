import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Expand input paths into a flat list of image files. A directory contributes its
 * PNGs (sorted); a file is taken as-is. Order and uniqueness are preserved.
 */
export function collectImages(paths) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };

  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      readdirSync(p)
        .filter((name) => /\.png$/i.test(name))
        .sort()
        .forEach((name) => add(join(p, name)));
    } else {
      add(p);
    }
  }
  return out;
}

const mean = (nums) => nums.reduce((sum, n) => sum + n, 0) / nums.length;

/**
 * Aggregate per-image comparison results into a per-codec summary: average bpp,
 * win count (smallest file for an image), mean savings vs a baseline codec, and
 * how many images reached the target. Sorted by average bpp (best first).
 *
 * @param {Array<{ image: string, results: Array<object> }>} perImage
 * @param {{ baselineId?: string }} [opts]
 */
export function aggregate(perImage, { baselineId } = {}) {
  const byId = new Map();
  const winsById = new Map();

  for (const { results } of perImage) {
    // A codec that failed on an image counts as an attempt, but has no size to
    // average, win with or compare.
    const measured = results.filter((r) => !r.failed);
    const winner = measured.reduce((best, r) => (!best || r.bytes < best.bytes ? r : best), null);
    if (winner) winsById.set(winner.id, (winsById.get(winner.id) || 0) + 1);

    const baseline = baselineId ? measured.find((r) => r.id === baselineId) : null;

    for (const r of results) {
      let entry = byId.get(r.id);
      if (!entry) {
        entry = { id: r.id, name: r.name, bpps: [], savings: [], reached: 0, count: 0 };
        byId.set(r.id, entry);
      }
      entry.count += 1;
      if (r.failed) continue;
      entry.bpps.push(r.bpp);
      if (r.reached) entry.reached += 1;
      if (baseline && baseline.bytes > 0) {
        entry.savings.push((1 - r.bytes / baseline.bytes) * 100);
      }
    }
  }

  return [...byId.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      avgBpp: e.bpps.length ? mean(e.bpps) : null,
      savingsPct: e.savings.length ? mean(e.savings) : null,
      wins: winsById.get(e.id) || 0,
      reached: e.reached,
      count: e.count,
    }))
    .sort((a, b) => (a.avgBpp ?? Infinity) - (b.avgBpp ?? Infinity));
}

/**
 * Aggregate per-image budget results (equal size) into a per-codec summary.
 *
 * The average ssimulacra2 and the mean difference from a baseline codec cover only
 * the images where every codec fit the budget, the same images for all, so codecs
 * are ranked on like for like: averaging each codec over its own images would
 * reward one for failing to fit the hardest ones. Wins (best quality among the
 * codecs that fit an image) and the fit count cover every image. Sorted by average
 * ssimulacra2 (best first).
 *
 * @param {Array<{ image: string, results: Array<object> }>} perImage
 * @param {{ baselineId?: string }} [opts]
 * @returns {Array<{ id, name, avgScore, deltaVsBaseline, wins, fits, count, compared }>}
 *   `compared` is the number of images the averages cover.
 */
export function aggregateBudget(perImage, { baselineId } = {}) {
  const byId = new Map();
  const fitsImage = (r) => !r.failed && r.fits;
  let compared = 0;

  for (const { results } of perImage) {
    const fitting = results.filter(fitsImage);
    const winner = fitting.reduce((best, r) => (!best || r.ssimulacra2 > best.ssimulacra2 ? r : best), null);
    const everyCodecFits = fitting.length === results.length;
    const baseline = baselineId ? fitting.find((r) => r.id === baselineId) : null;
    if (everyCodecFits) compared += 1;

    for (const r of results) {
      let entry = byId.get(r.id);
      if (!entry) {
        entry = { id: r.id, name: r.name, scores: [], deltas: [], wins: 0, fits: 0, count: 0 };
        byId.set(r.id, entry);
      }
      entry.count += 1;
      if (!fitsImage(r)) continue;
      entry.fits += 1;
      if (r === winner) entry.wins += 1;
      if (!everyCodecFits) continue;
      entry.scores.push(r.ssimulacra2);
      if (baseline) entry.deltas.push(r.ssimulacra2 - baseline.ssimulacra2);
    }
  }

  return [...byId.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      avgScore: e.scores.length ? mean(e.scores) : null,
      deltaVsBaseline: e.deltas.length ? mean(e.deltas) : null,
      wins: e.wins,
      fits: e.fits,
      count: e.count,
      compared,
    }))
    .sort((a, b) => (b.avgScore ?? -Infinity) - (a.avgScore ?? -Infinity));
}
