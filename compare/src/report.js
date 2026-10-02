const bySizeAscending = (a, b) => a.bytes - b.bytes;

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
  const rows = [...results].sort(bySizeAscending);
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
  const body = rows.map((r) => [
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
  ]);
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
  return [...heading, asciiTable(columns, body), ...footnote].join("\n");
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
    r.avgBpp.toFixed(3),
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

/** Render batch results as CSV, one row per (image, codec). */
export function toBatchCsv(perImage) {
  const head =
    "image,codec,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations," +
    "encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms";
  const lines = [];
  for (const { image, results } of perImage) {
    for (const r of [...results].sort(bySizeAscending)) {
      lines.push(
        `${csvField(image)},${csvField(r.name)},${csvField(r.label)},${r.bytes},${r.bpp.toFixed(4)},` +
          `${r.ssimulacra2.toFixed(4)},${r.dssim.toFixed(6)},${r.reached},${r.iterations},` +
          `${csvMs(r.encodeWallMs)},${csvMs(r.encodeCpuMs)},` +
          `${csvMs(r.totalEncodeWallMs)},${csvMs(r.totalEncodeCpuMs)}`,
      );
    }
  }
  return [head, ...lines].join("\n");
}

/** Render results as CSV, smallest file first. */
export function toCsv(results) {
  const rows = [...results].sort(bySizeAscending);
  const header =
    "codec,setting,bytes,bpp,ssimulacra2,dssim,iterations," +
    "encode_wall_ms,encode_cpu_ms,total_encode_wall_ms,total_encode_cpu_ms";
  const body = rows.map(
    (r) =>
      `${csvField(r.name)},${csvField(r.label)},${r.bytes},${r.bpp.toFixed(4)},` +
      `${r.ssimulacra2.toFixed(4)},${r.dssim.toFixed(6)},${r.iterations},` +
      `${csvMs(r.encodeWallMs)},${csvMs(r.encodeCpuMs)},` +
      `${csvMs(r.totalEncodeWallMs)},${csvMs(r.totalEncodeCpuMs)}`,
  );
  return [header, ...body].join("\n");
}
