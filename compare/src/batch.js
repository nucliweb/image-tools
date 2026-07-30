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
    const winner = results.reduce((best, r) => (!best || r.bytes < best.bytes ? r : best), null);
    if (winner) winsById.set(winner.id, (winsById.get(winner.id) || 0) + 1);

    const baseline = baselineId ? results.find((r) => r.id === baselineId) : null;

    for (const r of results) {
      let entry = byId.get(r.id);
      if (!entry) {
        entry = { id: r.id, name: r.name, bpps: [], savings: [], reached: 0, count: 0 };
        byId.set(r.id, entry);
      }
      entry.bpps.push(r.bpp);
      entry.count += 1;
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
      avgBpp: mean(e.bpps),
      savingsPct: e.savings.length ? mean(e.savings) : null,
      wins: winsById.get(e.id) || 0,
      reached: e.reached,
      count: e.count,
    }))
    .sort((a, b) => a.avgBpp - b.avgBpp);
}
