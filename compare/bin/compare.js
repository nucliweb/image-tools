#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { CODECS, DEFAULT_CODECS } from "../src/codecs.js";
import { findQualityForTarget } from "../src/pipeline.js";
import { pngDimensions, writeStrippedPng } from "../src/image.js";
import { toMarkdownTable, toCsv } from "../src/report.js";

const USAGE = `Usage: compare-codecs <reference.png> [options]

Encodes the reference with each codec, searching its quality knob until the
decoded image reaches an equal perceptual target (ssimulacra2), then reports
size vs quality so codecs are compared apples-to-apples.

Options:
  -t, --target <n>          Target ssimulacra2 score (default: 90)
  -c, --codecs <list>       Comma-separated: ${DEFAULT_CODECS.join(",")} (default: all)
      --tolerance <n>       Stop when within this of the target (default: 0.5)
      --max-iterations <n>  Max search steps per codec (default: 10)
      --csv <path>          Also write the results as CSV
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

  const reference = positionals[0];
  const target = Number(values.target);
  const tolerance = Number(values.tolerance);
  const maxIterations = Number(values["max-iterations"]);
  const ids = values.codecs ? values.codecs.split(",").map((s) => s.trim()) : DEFAULT_CODECS;

  const unknown = ids.filter((id) => !CODECS[id]);
  if (unknown.length) {
    console.error(`Unknown codec(s): ${unknown.join(", ")}. Known: ${Object.keys(CODECS).join(", ")}`);
    process.exit(1);
  }
  try {
    statSync(reference);
  } catch {
    console.error(`Reference not found: ${reference}`);
    process.exit(1);
  }

  const workdir = mkdtempSync(join(tmpdir(), "image-tools-"));
  try {
    const refNorm = join(workdir, "reference.norm.png");
    try {
      writeStrippedPng(reference, refNorm);
    } catch {
      console.error(`Reference must be a PNG in sRGB: ${reference}`);
      process.exit(1);
    }
    const { width, height } = pngDimensions(refNorm);

    const results = [];
    for (const id of ids) {
      process.stderr.write(`→ ${CODECS[id].name} …\n`);
      results.push(
        findQualityForTarget(CODECS[id], reference, target, workdir, {
          tolerance,
          maxIterations,
          referenceNorm: refNorm,
        }),
      );
    }

    console.log(toMarkdownTable(results, { reference: basename(reference), width, height, target }));

    if (values.csv) {
      writeFileSync(values.csv, `${toCsv(results)}\n`);
      process.stderr.write(`Wrote ${values.csv}\n`);
    }
  } finally {
    if (!values.keep) rmSync(workdir, { recursive: true, force: true });
    else process.stderr.write(`Kept work dir: ${workdir}\n`);
  }
}

main();
