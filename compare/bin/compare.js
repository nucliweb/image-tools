#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { CODECS, DEFAULT_CODECS, resolveCodecIds } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { pngDimensions, writeStrippedPng, pngDataUri } from "../src/image.js";
import { run, resolveCommand, failureReason } from "../src/exec.js";
import { collectImages, aggregate } from "../src/batch.js";
import { sweepCodec } from "../src/sweep.js";
import { buildHtml } from "../src/report-html.js";
import { parseTargets, aggregateBdRates, imageBdRates } from "../src/rd.js";
import {
  toComparisonTable,
  toCsv,
  toAggregateTable,
  toBatchCsv,
  toRdTable,
  toRdAggregateTable,
  toRdCsv,
} from "../src/report.js";

const USAGE = `Usage: compare-codecs <image-or-dir...> [options]

Encodes each reference (PNG files and/or directories of PNGs) with every codec,
searching its quality knob until the decoded image reaches an equal perceptual
target (ssimulacra2), then reports size vs quality so codecs are compared
apples-to-apples. With more than one image it also prints a batch summary
(average bpp, wins, and savings vs mozjpeg).

Options:
  -t, --target <n>          Target ssimulacra2 score (default: 90)
  -c, --codecs <list>       Comma-separated (default: ${DEFAULT_CODECS.join(",")}); opt-in
                            variants: ${Object.keys(CODECS).filter((id) => !DEFAULT_CODECS.includes(id)).join(",")};
                            "all" runs every codec and variant
      --tolerance <n>       Stop when within this of the target (default: 0.5)
      --max-iterations <n>  Max search steps per codec (default: 10)
      --effort <0..10>      Matched encoder effort across codecs (jxl/avif/webp); higher = slower
      --time-runs <n>       Time each codec's encode n times, report the median (default: 1)
      --rd <list>           Rate-distortion mode: search every codec at each of these
                            targets (e.g. 70,80,85,90,95), report bpp per target and
                            BD-rate vs mozjpeg. With --html, the report plots these
                            curves and shows the encodes at the target closest to
                            --target
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
      rd: { type: "string" },
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
  let rdTargets = null;
  if (values.rd !== undefined) {
    try {
      rdTargets = parseTargets(values.rd);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  let ids;
  try {
    ids = resolveCodecIds(values.codecs);
  } catch (err) {
    console.error(err.message);
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

    const searchOpts = { tolerance, maxIterations, timeRuns, effort };
    const baselineId = ids.includes("mozjpeg") ? "mozjpeg" : ids[0];
    const baselineName = CODECS[baselineId]?.name ?? baselineId;
    if (rdTargets) {
      runRd(images, ids, rdTargets, workdir, searchOpts, { baselineId, baselineName, csv: values.csv, html: values.html, target, embed });
      return;
    }

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
        let op;
        try {
          op = findQualityForTarget(codec, image, target, workdir, { ...searchOpts, referenceNorm: refNorm });
        } catch (err) {
          // One codec failing on one image (an unsupported input, a crash) is a
          // result to report, not a reason to abandon the whole run.
          const error = failureReason(err);
          process.stderr.write(`  ! ${codec.name} failed on ${basename(image)}: ${error}\n`);
          results.push({ id, name: codec.name, failed: true, error });
          continue;
        }
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
        try {
          const { points } = sweepCodec(codec, refNorm, dims.pixels, workdir, effort);
          reportCodecs.push({ id, name: codec.name, points, preview });
        } catch (err) {
          process.stderr.write(`  ! ${codec.name} sweep failed on ${basename(image)}, left out of the report: ${failureReason(err)}\n`);
        }
      }

      perImage.push({ image: basename(image), width: dims.width, height: dims.height, results });
      // An image on which every codec failed has nothing to show in the report.
      if (values.html && reportCodecs.length > 0) {
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
      const rows = aggregate(perImage, { baselineId });
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

/**
 * Rate-distortion mode: run the equal-quality search for every image, codec and
 * target, then print one RD table per image (bpp per target and BD-rate vs the
 * baseline), a mean BD-rate summary for a batch, and optionally a long CSV and
 * an HTML report that plots the same points and BD-rates.
 */
function runRd(images, ids, targets, workdir, searchOpts, { baselineId, baselineName, csv, html, target, embed }) {
  // The report's viewer shows one encode per codec: the one at the RD target
  // closest to --target, embedded right after its search, before the next search
  // reuses the work directory.
  const previewTarget = targets.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best));
  const perImage = [];
  const reportImages = [];
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
    const previews = new Map();
    const codecs = ids.map((id) => {
      const codec = CODECS[id];
      process.stderr.write(`  → ${codec.name} @ ${targets.join(", ")} …\n`);
      const points = targets.map((target) => {
        try {
          const op = findQualityForTarget(codec, image, target, workdir, { ...searchOpts, referenceNorm: refNorm });
          if (html && target === previewTarget) previews.set(id, { ...op, dataUri: embed(op.decodedPng, dims) });
          return { target, ...op };
        } catch (err) {
          const error = failureReason(err);
          process.stderr.write(`  ! ${codec.name} failed on ${basename(image)} at ${target}: ${error}\n`);
          return { target, failed: true, error };
        }
      });
      return { id, name: codec.name, points };
    });
    perImage.push({ image: basename(image), width: dims.width, height: dims.height, codecs });

    // A codec whose encode at the preview target failed has nothing to show in the
    // viewer, so the report leaves it out, as it does outside RD mode.
    if (!html) return;
    const rates = imageBdRates(codecs, baselineId);
    const reportCodecs = codecs
      .filter((c) => previews.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        points: c.points.filter((p) => !p.failed).sort((a, b) => a.ssimulacra2 - b.ssimulacra2),
        preview: previews.get(c.id),
        bdRate: rates.get(c.id),
      }));
    if (reportCodecs.length > 0) {
      reportImages.push({
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

  const meta = { targets, baselineId, baselineName };
  console.log(perImage.map((p) => toRdTable(p, meta)).join("\n\n"));

  const aggregateRows = aggregateBdRates(perImage, baselineId);
  if (perImage.length > 1) {
    console.log(`\n${toRdAggregateTable(aggregateRows, { ...meta, imageCount: perImage.length })}`);
  }

  if (csv) {
    writeFileSync(csv, `${toRdCsv(perImage)}\n`);
    process.stderr.write(`Wrote ${csv}\n`);
  }

  if (html) {
    const rd = { targets, baselineId, baselineName, aggregate: aggregateRows };
    writeFileSync(html, buildHtml({ target: previewTarget, rd, images: reportImages }));
    process.stderr.write(`Wrote ${html}\n`);
  }
}

main();
