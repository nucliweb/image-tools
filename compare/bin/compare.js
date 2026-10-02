#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { CODECS, DEFAULT_CODECS } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { pngDimensions, writeStrippedPng, pngDataUri } from "../src/image.js";
import { run, resolveCommand } from "../src/exec.js";
import { collectImages, aggregate } from "../src/batch.js";
import { sweepCodec } from "../src/sweep.js";
import { buildHtml } from "../src/report-html.js";
import { toComparisonTable, toCsv, toAggregateTable, toBatchCsv } from "../src/report.js";

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
      --effort <0..10>      Matched encoder effort across codecs (jxl/avif/webp); higher = slower
      --time-runs <n>       Time each codec's encode n times, report the median (default: 1)
      --csv <path>          Also write the results as CSV
      --html <path>         Write an interactive self-contained HTML report
      --html-max-dim <n>    Downscale embedded report images above this size (default: 1600)
      --keep                Keep the temporary work directory
  -h, --help                Show this help

The reference must be a PNG in sRGB.

In the results, the iters column is the number of binary-search steps taken to
reach the equal-quality setting (each at a different quality), not timing
repetitions. The encode/cpu columns time a single encode at that setting; use
--time-runs to repeat it and report the median.`;

function parse() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t", default: "90" },
      codecs: { type: "string", short: "c" },
      tolerance: { type: "string", default: "0.5" },
      "max-iterations": { type: "string", default: "10" },
      effort: { type: "string" },
      "time-runs": { type: "string", default: "1" },
      csv: { type: "string" },
      html: { type: "string" },
      "html-max-dim": { type: "string", default: "1600" },
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
  const timeRuns = Math.max(1, Math.floor(Number(values["time-runs"])) || 1);
  let effort = null;
  if (values.effort !== undefined) {
    effort = Number(values.effort);
    if (!Number.isFinite(effort) || effort < 0 || effort > 10) {
      console.error("--effort must be a number in 0..10.");
      process.exit(1);
    }
  }
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
    // Embed a PNG as a data URI for the HTML report, downscaling it first (via
    // vipsthumbnail) when its longest side exceeds maxDim, to keep the report small.
    // Metrics are unaffected; only the embedded preview is resized.
    const maxDim = Number(values["html-max-dim"]);
    let embedSeq = 0;
    const embed = (pngPath, dims) => {
      if (!(maxDim > 0) || Math.max(dims.width, dims.height) <= maxDim) {
        return pngDataUri(pngPath);
      }
      const small = join(workdir, `embed${embedSeq++}.png`);
      run(resolveCommand("vipsthumbnail"), [pngPath, "--size", String(maxDim), "-o", small]);
      return pngDataUri(small);
    };

    // One equal-quality search per image and codec feeds every output: the table,
    // the CSV and the HTML report. The report adds a rate-distortion sweep per codec.
    const perImage = [];
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
      const results = [];
      const reportCodecs = [];
      for (const id of ids) {
        const codec = CODECS[id];
        process.stderr.write(`  → ${codec.name} …\n`);
        const op = findQualityForTarget(codec, image, target, workdir, {
          tolerance,
          maxIterations,
          timeRuns,
          effort,
          referenceNorm: refNorm,
        });
        results.push(op);
        if (!values.html) continue;

        // Embed the decoded preview before the sweep reuses the work directory. The
        // preview is the equal-quality operating point itself, so its label and size
        // match the table rather than the nearest coarse sweep point.
        const preview = {
          ssimulacra2: op.ssimulacra2,
          bpp: op.bpp,
          bytes: op.bytes,
          dssim: op.dssim,
          label: op.label,
          dataUri: embed(op.decodedPng, dims),
          encodeWallMs: op.encodeWallMs,
          encodeCpuMs: op.encodeCpuMs,
        };
        process.stderr.write(`  ~ ${codec.name} sweep …\n`);
        const { points } = sweepCodec(codec, refNorm, dims.pixels, workdir, effort);
        reportCodecs.push({ id, name: codec.name, points, preview });
      }

      perImage.push({ image: basename(image), width: dims.width, height: dims.height, results });
      if (values.html) {
        report.images.push({
          name: basename(image),
          width: dims.width,
          height: dims.height,
          originalDataUri: embed(refNorm, dims),
          codecs: reportCodecs,
        });
      }
    });

    if (perImage.length === 0) {
      console.error("No usable PNG images.");
      process.exit(1);
    }

    const blocks = perImage.map((p) =>
      toComparisonTable(p.results, { reference: p.image, width: p.width, height: p.height, target, effort }),
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

    if (values.html) {
      writeFileSync(values.html, buildHtml(report));
      process.stderr.write(`Wrote ${values.html}\n`);
    }
  } finally {
    if (!values.keep) rmSync(workdir, { recursive: true, force: true });
    else process.stderr.write(`Kept work dir: ${workdir}\n`);
  }
}

main();
