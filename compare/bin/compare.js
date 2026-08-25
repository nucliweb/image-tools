#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { CODECS, DEFAULT_CODECS } from "../src/codecs.js";
import { findQualityForTarget, medianEncodeTiming } from "../src/pipeline.js";
import { pngDimensions, writeStrippedPng, pngDataUri } from "../src/image.js";
import { run, resolveCommand } from "../src/exec.js";
import { collectImages, aggregate } from "../src/batch.js";
import { sweepCodec, nearestPoint } from "../src/sweep.js";
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
    if (values.html) {
      const maxDim = Number(values["html-max-dim"]);
      // Embed a PNG as a data URI, downscaling it first (via vipsthumbnail) when
      // its longest side exceeds maxDim, to keep the report small. Metrics are
      // unaffected; only the embedded preview is resized.
      let embedSeq = 0;
      const embed = (pngPath, dims) => {
        if (!(maxDim > 0) || Math.max(dims.width, dims.height) <= maxDim) {
          return pngDataUri(pngPath);
        }
        const small = join(workdir, `embed${embedSeq++}.png`);
        run(resolveCommand("vipsthumbnail"), [pngPath, "--size", String(maxDim), "-o", small]);
        return pngDataUri(small);
      };

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
          const { points } = sweepCodec(codec, refNorm, dims.pixels, workdir, effort);
          const prev = nearestPoint(points, target);
          // With more than one timing run, re-time the preview point and report the
          // median; a single run reuses the sweep's own timing sample.
          const timing =
            timeRuns > 1
              ? medianEncodeTiming(codec, refNorm, prev.knob, workdir, timeRuns, effort)
              : { wallMs: prev.encodeWallMs, cpuMs: prev.encodeCpuMs };
          return {
            id,
            name: codec.name,
            points,
            preview: {
              ...prev,
              dataUri: embed(prev.decodedPng, dims),
              encodeWallMs: timing.wallMs,
              encodeCpuMs: timing.cpuMs,
            },
          };
        });
        report.images.push({
          name: basename(image),
          width: dims.width,
          height: dims.height,
          originalDataUri: embed(refNorm, dims),
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
          timeRuns,
          effort,
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
  } finally {
    if (!values.keep) rmSync(workdir, { recursive: true, force: true });
    else process.stderr.write(`Kept work dir: ${workdir}\n`);
  }
}

main();
