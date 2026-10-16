/**
 * Size-regression checking for the CI gate. Compares the bytes-at-equal-quality a
 * comparison run produced against a committed baseline, so a change that makes a
 * codec's output larger (beyond a tolerance) fails the build. Both are deterministic
 * given the pinned codec versions in the image. The achieved ssimulacra2 score is
 * checked too, so a file cannot pass as "smaller" by settling at a lower quality.
 */

/**
 * Split one CSV line into fields, honouring double-quoted fields (which may hold
 * commas, and escape a quote by doubling it).
 */
function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Parse a comparison CSV (single-image or batch) into { image, codec, bytes, ssimulacra2 } rows. */
export function parseResultsCsv(text) {
  const lines = text.trim().split("\n");
  const header = splitCsvLine(lines[0]);
  const iImage = header.indexOf("image");
  const iCodec = header.indexOf("codec");
  const iBytes = header.indexOf("bytes");
  const iScore = header.indexOf("ssimulacra2");
  const iError = header.indexOf("error");
  // A failed (image, codec) has no size; leaving it out makes the check report it
  // as missing, rather than reading its empty bytes as an improvement.
  return lines
    .slice(1)
    .map(splitCsvLine)
    .filter((cols) => iError < 0 || !cols[iError])
    .map((cols) => ({
      image: iImage >= 0 ? cols[iImage] : "",
      codec: cols[iCodec],
      bytes: Number(cols[iBytes]),
      ssimulacra2: Number(cols[iScore]),
    }));
}

// A NUL separator cannot appear in a file or codec name, so keys never collide.
const key = (image, codec) => `${image}\u0000${codec}`;

/**
 * Compare current results against a baseline. A codec whose bytes exceed
 * baseline × (1 + tolerance) is a regression, as is one whose ssimulacra2 score
 * drops more than qualityTolerance points below the baseline's; a missing codec
 * also fails. Smaller or equal (within tolerance) at the same quality passes. A run
 * at a different target than the baseline's is not comparable, so it fails with an
 * error and no rows.
 *
 * @param {{ target: number, images: Record<string, Record<string, { bytes: number, ssimulacra2: number }>> }} baseline
 * @param {Array<{ image: string, codec: string, bytes: number, ssimulacra2: number }>} current
 * @param {{ tolerance: number, qualityTolerance: number, target: number }} opts
 *   tolerance is fractional slack on bytes (0.02 = 2%); qualityTolerance is in
 *   ssimulacra2 points; target is the run's target score.
 * @returns {{ failed: boolean, error?: string, rows: Array<object> }}
 */
export function checkRegressions(baseline, current, { tolerance, qualityTolerance, target }) {
  if (baseline.target !== target) {
    return {
      failed: true,
      error: `The run used target ${target}, but the baseline was generated at target ${baseline.target}; the sizes are not comparable.`,
      rows: [],
    };
  }

  const byKey = new Map(current.map((r) => [key(r.image, r.codec), r]));
  const rows = [];
  let failed = false;

  for (const [image, codecs] of Object.entries(baseline.images)) {
    for (const [codec, base] of Object.entries(codecs)) {
      const cur = byKey.get(key(image, codec));
      if (cur === undefined) {
        rows.push({ image, codec, baseline: base, current: null, deltaPct: null, deltaScore: null, status: "missing" });
        failed = true;
        continue;
      }
      const deltaPct = ((cur.bytes - base.bytes) / base.bytes) * 100;
      const deltaScore = cur.ssimulacra2 - base.ssimulacra2;
      let status;
      if (deltaScore < -qualityTolerance) {
        status = "QUALITY";
        failed = true;
      } else if (cur.bytes > base.bytes * (1 + tolerance)) {
        status = "REGRESSED";
        failed = true;
      } else if (cur.bytes < base.bytes) {
        status = "improved";
      } else {
        status = "ok";
      }
      rows.push({ image, codec, baseline: base, current: cur, deltaPct, deltaScore, status });
    }
  }
  return { failed, rows };
}

/** Build a baseline object from parsed CSV rows. */
export function baselineFromRows(rows, target) {
  const images = {};
  for (const r of rows) {
    (images[r.image] ??= {})[r.codec] = { bytes: r.bytes, ssimulacra2: r.ssimulacra2 };
  }
  return { target, images };
}
