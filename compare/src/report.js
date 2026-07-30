const bySizeAscending = (a, b) => a.bytes - b.bytes;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Render results as a Markdown comparison table, smallest file first. */
export function toMarkdownTable(results, meta) {
  const rows = [...results].sort(bySizeAscending);
  const header = [
    `## Codec comparison — ${meta.reference} (${meta.width}×${meta.height})`,
    "",
    `Target: ssimulacra2 ${meta.target} (equal perceptual quality; compare size).`,
    "",
    "| Codec | Setting | Size | bpp | ssimulacra2 | dssim | iters |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  const body = rows.map(
    (r) =>
      `| ${r.name} | ${r.label} | ${formatBytes(r.bytes)} | ${r.bpp.toFixed(3)} | ` +
      `${r.ssimulacra2.toFixed(2)} | ${r.dssim.toFixed(5)} | ${r.iterations} |`,
  );
  return [...header, ...body].join("\n");
}

/** Render results as CSV, smallest file first. */
export function toCsv(results) {
  const rows = [...results].sort(bySizeAscending);
  const header = "codec,setting,bytes,bpp,ssimulacra2,dssim,iterations";
  const body = rows.map(
    (r) =>
      `${r.name},${r.label},${r.bytes},${r.bpp.toFixed(4)},` +
      `${r.ssimulacra2.toFixed(4)},${r.dssim.toFixed(6)},${r.iterations}`,
  );
  return [header, ...body].join("\n");
}
