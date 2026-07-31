#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { CODECS, DEFAULT_CODECS } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { pngDimensions, writeStrippedPng, pngDataUri } from "../src/image.js";
import { collectImages, aggregate } from "../src/batch.js";
import { sweepCodec, nearestPoint } from "../src/sweep.js";
import { buildHtml } from "../src/report-html.js";
import { toMarkdownTable, toCsv, toAggregateTable, toBatchCsv } from "../src/report.js";

const USAGE = `Usage: compare-codecs <image-or-dir...> [options]

Encodes each reference (PNG files and/or directories of PNGs) with every codec,
searching its quality knob until the decoded image reaches an equal perceptual
target (ssimulacra2), then reports size vs quality so codecs are compared
apples-to-apples. With more than one image it also prints a batch summary
(average bpp, wins, and savings vs mozjpeg).

Options:
  -t, --target <n>          Target ssimulacra2 score (default: 90)
  -c, --codecs <list>       Comma-separated: ${DEFAULT_CODECS.join(",")} (default: all)
      --tolerance <n>       Stop when within this of the target (default: 0.5)
      --max-iterations <n>  Max search steps per codec (default: 10)
      --csv <path>          Also write the results as CSV
      --html <path>         Write an interactive self-contained HTML report
      --keep                Keep the temporary work directory
  -h, --help                Show this help

The reference must be a PNG in sRGB.`;

function parse() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t", default: "90" },
      codecs: { type: "string", short: "c" },
      tolerance: { type: "string", default: "0.5" },
      "max-iterations": { type: "string", default: "10" },
      csv: { type: "string" },
      html: { type: "string" },
      keep: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  return { values, positionals };
}

function main() {
  const { values, positionals } = parse();

  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const target = Number(values.target);
  const tolerance = Number(values.tolerance);
  const maxIterations = Number(values["max-iterations"]);
  const ids = values.codecs ? values.codecs.split(",").map((s) => s.trim()) : DEFAULT_CODECS;

  const unknown = ids.filter((id) => !CODECS[id]);
  if (unknown.length) {
    console.error(`Unknown codec(s): ${unknown.join(", ")}. Known: ${Object.keys(CODECS).join(", ")}`);
    process.exit(1);
  }

  let images;
  try {
    images = collectImages(positionals);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (images.length === 0) {
    console.error("No PNG images found in the given paths.");
    process.exit(1);
  }

  const workdir = mkdtempSync(join(tmpdir(), "image-tools-"));
  try {
    if (values.html) {
      const report = { target, images: [] };
      images.forEach((image, idx) => {
        const refNorm = join(workdir, `img${idx}.norm.png`);
        let dims;
        try {
          writeStrippedPng(image, refNorm);
          dims = pngDimensions(refNorm);
        } catch {
          process.stderr.write(`Skipping (not a PNG in sRGB): ${image}\n`);
          return;
        }
        process.stderr.write(`# ${basename(image)}\n`);
        const codecs = ids.map((id) => {
          const codec = CODECS[id];
          process.stderr.write(`  ~ ${codec.name} sweep …\n`);
          const { points } = sweepCodec(codec, refNorm, dims.pixels, workdir);
          const prev = nearestPoint(points, target);
          return {
            id,
            name: codec.name,
            points,
            preview: { ...prev, dataUri: pngDataUri(prev.decodedPng) },
          };
        });
        report.images.push({
          name: basename(image),
          width: dims.width,
          height: dims.height,
          originalDataUri: pngDataUri(refNorm),
          codecs,
        });
      });

      if (report.images.length === 0) {
        console.error("No usable PNG images.");
        process.exit(1);
      }
      writeFileSync(values.html, buildHtml(report));
      process.stderr.write(`Wrote ${values.html}\n`);
      return;
    }

    const perImage = [];
    images.forEach((image, idx) => {
      const refNorm = join(workdir, `img${idx}.norm.png`);
      let dims;
      try {
        writeStrippedPng(image, refNorm);
        dims = pngDimensions(refNorm);
      } catch {
        process.stderr.write(`Skipping (not a PNG in sRGB): ${image}\n`);
        return;
      }

      process.stderr.write(`# ${basename(image)}\n`);
      const results = ids.map((id) => {
        process.stderr.write(`  → ${CODECS[id].name} …\n`);
        return findQualityForTarget(CODECS[id], image, target, workdir, {
          tolerance,
          maxIterations,
          referenceNorm: refNorm,
        });
      });

      perImage.push({ image: basename(image), width: dims.width, height: dims.height, results });
    });

    if (perImage.length === 0) {
      console.error("No usable PNG images.");
      process.exit(1);
    }

    const blocks = perImage.map((p) =>
      toMarkdownTable(p.results, { reference: p.image, width: p.width, height: p.height, target }),
    );
    console.log(blocks.join("\n\n"));

    if (perImage.length > 1) {
      const baselineId = ids.includes("mozjpeg") ? "mozjpeg" : ids[0];
      const rows = aggregate(perImage, { baselineId });
      const baselineName = CODECS[baselineId]?.name ?? baselineId;
      console.log(`\n${toAggregateTable(rows, { imageCount: perImage.length, target, baselineName })}`);
    }

    if (values.csv) {
      const csv = perImage.length > 1 ? toBatchCsv(perImage) : toCsv(perImage[0].results);
      writeFileSync(values.csv, `${csv}\n`);
      process.stderr.write(`Wrote ${values.csv}\n`);
    }
  } finally {
    if (!values.keep) rmSync(workdir, { recursive: true, force: true });
    else process.stderr.write(`Kept work dir: ${workdir}\n`);
  }
}

main();
