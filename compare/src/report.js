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
  const body = rows.map((r) => {
    const mark = r.reached === false ? " \\*" : "";
    return (
      `| ${r.name} | ${r.label} | ${formatBytes(r.bytes)} | ${r.bpp.toFixed(3)} | ` +
      `${r.ssimulacra2.toFixed(2)}${mark} | ${r.dssim.toFixed(5)} | ${r.iterations} |`
    );
  });
  const footnote = rows.some((r) => r.reached === false)
    ? ["", "\\* target not reachable for this image (codec range exhausted); closest setting shown."]
    : [];
  return [...header, ...body, ...footnote].join("\n");
}

/** Render the per-codec aggregate over a batch of images. */
export function toAggregateTable(rows, meta) {
  const baseline = meta.baselineName ?? "baseline";
  const header = [
    `## Batch summary — ${meta.imageCount} images, target ssimulacra2 ${meta.target}`,
    "",
    `| Codec | avg bpp | wins | savings vs ${baseline} | reached target |`,
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  const body = rows.map((r) => {
    const savings = r.savingsPct === null ? "—" : `${r.savingsPct.toFixed(1)}%`;
    return `| ${r.name} | ${r.avgBpp.toFixed(3)} | ${r.wins} | ${savings} | ${r.reached}/${r.count} |`;
  });
  return [...header, ...body].join("\n");
}

/** Render batch results as CSV, one row per (image, codec). */
export function toBatchCsv(perImage) {
  const head = "image,codec,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations";
  const lines = [];
  for (const { image, results } of perImage) {
    for (const r of [...results].sort(bySizeAscending)) {
      lines.push(
        `${image},${r.name},${r.label},${r.bytes},${r.bpp.toFixed(4)},` +
          `${r.ssimulacra2.toFixed(4)},${r.dssim.toFixed(6)},${r.reached},${r.iterations}`,
      );
    }
  }
  return [head, ...lines].join("\n");
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
