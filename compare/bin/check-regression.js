#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { parseResultsCsv, checkRegressions, baselineFromRows } from "../src/regression.js";

const USAGE = `Usage: check-regression <baseline.json> <results.csv> [options]

Compare a comparison run's file sizes against a committed baseline and fail on a
regression: a codec's bytes at equal quality grew beyond the tolerance, its
ssimulacra2 score dropped beyond the quality tolerance, or it is missing. Both are
deterministic given pinned codec versions.

Options:
      --target <n>             Target the run used; must match the baseline's.
                               With --update, the target recorded (default: 90)
      --tolerance <n>          Fractional slack before a larger file fails (default: 0.02)
      --quality-tolerance <n>  ssimulacra2 points a score may drop (default: 0.5)
      --update                 Rewrite the baseline from the CSV instead of checking
  -h, --help                   Show this help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tolerance: { type: "string", default: "0.02" },
    "quality-tolerance": { type: "string", default: "0.5" },
    update: { type: "boolean", default: false },
    target: { type: "string", default: "90" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || positionals.length < 2) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const [baselinePath, csvPath] = positionals;
const rows = parseResultsCsv(readFileSync(csvPath, "utf8"));

if (values.update) {
  const baseline = baselineFromRows(rows, Number(values.target));
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Wrote baseline for ${rows.length} (image, codec) pairs to ${baselinePath}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const tolerance = Number(values.tolerance);
const qualityTolerance = Number(values["quality-tolerance"]);
const target = Number(values.target);
const { failed, error, rows: results } = checkRegressions(baseline, rows, { tolerance, qualityTolerance, target });

if (error) {
  console.error(`FAIL: ${error}`);
  process.exit(1);
}

const signed = (n, digits, unit) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}${unit}`);
console.log(
  `Size regression check (target ${target}, size tolerance ${(tolerance * 100).toFixed(1)}%, ` +
    `quality tolerance ${qualityTolerance} ssimulacra2)\n`,
);
for (const r of results) {
  const size = r.current === null ? "missing" : String(r.current.bytes);
  const score = r.current === null ? "—" : r.current.ssimulacra2.toFixed(2);
  console.log(
    `  ${r.status.padEnd(10)} ${r.image}  ${r.codec}  base ${r.baseline.bytes} → ${size}  (${signed(r.deltaPct, 2, "%")})` +
      `  ss2 ${r.baseline.ssimulacra2.toFixed(2)} → ${score}  (${signed(r.deltaScore, 2, "")})`,
  );
}
if (failed) {
  console.error("\nFAIL: at least one codec regressed in size or quality, or is missing.");
  process.exit(1);
}
console.log("\nOK: no size or quality regressions.");
