import { imageBdRates } from "./rd.js";

const bySizeAscending = (a, b) => a.bytes - b.bytes;

/** Measured results smallest first, then the codecs that failed on this image. */
const measuredFirst = (results) => [
  ...results.filter((r) => !r.failed).sort(bySizeAscending),
  ...results.filter((r) => r.failed),
];

/** Footnote lines naming each failed codec and why it failed. */
const failureNotes = (failures) =>
  failures.length ? ["", ...failures.map((f) => `† ${f.name} failed${f.at ?? ""}: ${f.error}`)] : [];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Format a duration in ms for a human: "n/a" when unmeasured, ms under a second, else seconds. */
function formatDuration(ms) {
  if (ms === null || ms === undefined) return "n/a";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** A raw ms value for CSV: an empty field when unmeasured, otherwise rounded. */
function csvMs(ms) {
  return ms === null || ms === undefined ? "" : String(Math.round(ms));
}

/**
 * Render a fixed-width ASCII table with +/-/| borders, so columns stay aligned
 * in a terminal. `columns` gives each header and its alignment; `rows` is an
 * array of string cells matching the columns.
 *
 * @param {Array<{ header: string, align?: "left" | "right" }>} columns
 * @param {string[][]} rows
 */
function asciiTable(columns, rows) {
  const widths = columns.map((col, i) =>
    Math.max(col.header.length, ...rows.map((cells) => cells[i].length)),
  );
  const border = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
  const line = (cells) =>
    `|${cells
      .map((cell, i) => {
        const padding = " ".repeat(widths[i] - cell.length);
        return columns[i].align === "right" ? ` ${padding}${cell} ` : ` ${cell}${padding} `;
      })
      .join("|")}|`;
  return [
    border,
    line(columns.map((col) => col.header)),
    border,
    ...rows.map(line),
    border,
  ].join("\n");
}

/** Render results as an ASCII comparison table, smallest file first. */
export function toComparisonTable(results, meta) {
  const rows = measuredFirst(results);
  const columns = [
    { header: "Codec", align: "left" },
    { header: "Setting", align: "left" },
    { header: "Size", align: "right" },
    { header: "bpp", align: "right" },
    { header: "ssimulacra2", align: "right" },
    { header: "dssim", align: "right" },
    { header: "iters", align: "right" },
    { header: "encode", align: "right" },
    { header: "cpu", align: "right" },
    { header: "enc total", align: "right" },
    { header: "cpu total", align: "right" },
  ];
  const body = rows.map((r) =>
    r.failed
      ? [r.name, "—", "failed", ...Array(columns.length - 3).fill("—")]
      : [
    r.name,
    r.label,
    formatBytes(r.bytes),
    r.bpp.toFixed(3),
    `${r.ssimulacra2.toFixed(2)}${r.reached === false ? " *" : ""}`,
    r.dssim.toFixed(5),
    String(r.iterations),
    formatDuration(r.encodeWallMs),
    formatDuration(r.encodeCpuMs),
    formatDuration(r.totalEncodeWallMs),
    formatDuration(r.totalEncodeCpuMs),
        ],
  );
  const heading = [
    `Codec comparison — ${meta.reference} (${meta.width}×${meta.height})`,
    `Target: ssimulacra2 ${meta.target} (equal perceptual quality; compare size).`,
    ...(meta.effort === null || meta.effort === undefined
      ? []
      : [`Effort: ${meta.effort} (matched where supported; codecs without an effort knob use their default).`]),
    "",
  ];
  const footnote = rows.some((r) => r.reached === false)
    ? ["", "* target not reachable for this image (codec range exhausted); closest setting shown."]
    : [];
  const failures = failureNotes(rows.filter((r) => r.failed));
  return [...heading, asciiTable(columns, body), ...footnote, ...failures].join("\n");
}

/** Render the per-codec aggregate over a batch of images as an ASCII table. */
export function toAggregateTable(rows, meta) {
  const baseline = meta.baselineName ?? "baseline";
  const columns = [
    { header: "Codec", align: "left" },
    { header: "avg bpp", align: "right" },
    { header: "wins", align: "right" },
    { header: `savings vs ${baseline}`, align: "right" },
    { header: "reached target", align: "right" },
  ];
  const body = rows.map((r) => [
    r.name,
    r.avgBpp === null ? "n/a" : r.avgBpp.toFixed(3),
    String(r.wins),
    r.savingsPct === null ? "n/a" : `${r.savingsPct.toFixed(1)}%`,
    `${r.reached}/${r.count}`,
  ]);
  const heading = [`Batch summary — ${meta.imageCount} images, target ssimulacra2 ${meta.target}`, ""];
  return [...heading, asciiTable(columns, body)].join("\n");
}

/** Quote a CSV field when it holds a comma, a quote or a newline (RFC 4180). */
function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The metric columns of each CSV, after the codec name and before the error.
const SINGLE_FIELDS = [
  (r) => csvField(r.label),
  (r) => r.bytes,
  (r) => r.bpp.toFixed(4),
  (r) => r.ssimulacra2.toFixed(4),
  (r) => r.dssim.toFixed(6),
  (r) => r.iterations,
  (r) => csvMs(r.encodeWallMs),
  (r) => csvMs(r.encodeCpuMs),
  (r) => csvMs(r.totalEncodeWallMs),
  (r) => csvMs(r.totalEncodeCpuMs),
];
const BATCH_FIELDS = [...SINGLE_FIELDS.slice(0, 5), (r) => r.reached, ...SINGLE_FIELDS.slice(5)];

/** One CSV row: the codec, its metrics (empty for a failed codec), and the error. */
function csvRow(r, fields) {
  const metrics = r.failed ? fields.map(() => "") : fields.map((f) => f(r));
  return [csvField(r.name), ...metrics, r.failed ? csvField(r.error) : ""].join(",");
}

/** Render batch results as CSV, one row per (image, codec). */
export function toBatchCsv(perImage) {
  const head =
    "image,codec,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations," +
    "encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms,error";
  const lines = [];
  for (const { image, results } of perImage) {
    for (const r of measuredFirst(results)) {
      lines.push(`${csvField(image)},${csvRow(r, BATCH_FIELDS)}`);
    }
  }
  return [head, ...lines].join("\n");
}

/** Render results as CSV, smallest file first. */
export function toCsv(results) {
  const header =
    "codec,setting,bytes,bpp,ssimulacra2,dssim,iterations," +
    "encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms,error";
  return [header, ...measuredFirst(results).map((r) => csvRow(r, SINGLE_FIELDS))].join("\n");
}

const formatBdRate = (rate) => (rate === null ? "n/a" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`);
const byRateAscending = (rateOf) => (a, b) => (rateOf(a) ?? Infinity) - (rateOf(b) ?? Infinity);

/**
 * Render one image's rate-distortion result as an ASCII table: one row per codec,
 * its bpp at each target, and its BD-rate against the baseline (best first).
 */
export function toRdTable(imageRd, meta) {
  const rates = imageBdRates(imageRd.codecs, meta.baselineId);
  const rows = [...imageRd.codecs].sort(byRateAscending((c) => rates.get(c.id)));
  const columns = [
    { header: "Codec", align: "left" },
    ...meta.targets.map((t) => ({ header: `bpp @${t}`, align: "right" })),
    { header: `BD-rate vs ${meta.baselineName}`, align: "right" },
  ];
  const body = rows.map((c) => [
    c.name,
    ...meta.targets.map((t) => {
      const p = c.points.find((point) => point.target === t);
      if (!p) return "n/a";
      return p.failed ? "failed" : `${p.bpp.toFixed(3)}${p.reached === false ? " *" : ""}`;
    }),
    c.id === meta.baselineId ? "baseline" : formatBdRate(rates.get(c.id)),
  ]);
  const heading = [
    `Rate–distortion — ${imageRd.image} (${imageRd.width}×${imageRd.height})`,
    `Targets: ssimulacra2 ${meta.targets.join(", ")} (bpp at each; BD-rate < 0 means fewer bits at equal quality).`,
    "",
  ];
  const unreached = rows.some((c) => c.points.some((p) => p.reached === false));
  const footnote = unreached
    ? ["", "* target not reachable for this image (codec range exhausted); closest setting shown."]
    : [];
  const failures = failureNotes(
    rows.flatMap((c) => c.points.filter((p) => p.failed).map((p) => ({ name: c.name, at: ` at ${p.target}`, error: p.error }))),
  );
  return [...heading, asciiTable(columns, body), ...footnote, ...failures].join("\n");
}

/** Render the mean BD-rate per codec over a batch of images as an ASCII table. */
export function toRdAggregateTable(rows, meta) {
  const columns = [
    { header: "Codec", align: "left" },
    { header: `mean BD-rate vs ${meta.baselineName}`, align: "right" },
    { header: "rated", align: "right" },
  ];
  const body = rows.map((r) => [
    r.name,
    r.id === meta.baselineId ? "baseline" : formatBdRate(r.meanBdRate),
    `${r.rated}/${r.count}`,
  ]);
  const heading = [
    `Rate–distortion summary — ${meta.imageCount} images, targets ssimulacra2 ${meta.targets.join(", ")}`,
    "",
  ];
  return [...heading, asciiTable(columns, body)].join("\n");
}

/** Render rate-distortion results as CSV, one row per (image, codec, target). */
export function toRdCsv(perImageRd) {
  const head = "image,codec,target,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations,error";
  const lines = [];
  for (const { image, codecs } of perImageRd) {
    for (const c of codecs) {
      for (const p of c.points) {
        const metrics = p.failed
          ? ",,,,,,,"
          : `,${csvField(p.label)},${p.bytes},${p.bpp.toFixed(4)},${p.ssimulacra2.toFixed(4)},` +
            `${p.dssim.toFixed(6)},${p.reached},${p.iterations}`;
        lines.push(`${csvField(image)},${csvField(c.name)},${p.target}${metrics},${p.failed ? csvField(p.error) : ""}`);
      }
    }
  }
  return [head, ...lines].join("\n");
}
