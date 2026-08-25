#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { parseResultsCsv, checkRegressions, baselineFromRows } from "../src/regression.js";

const USAGE = `Usage: check-regression <baseline.json> <results.csv> [options]

Compare a comparison run's file sizes against a committed baseline and fail on a
regression. Only bytes-at-equal-quality are checked (deterministic given pinned
codec versions).

Options:
      --tolerance <n>   Fractional slack before a larger file fails (default: 0.02)
      --update          Rewrite the baseline from the CSV instead of checking
      --target <n>      Target recorded in an updated baseline (default: 90)
  -h, --help            Show this help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tolerance: { type: "string", default: "0.02" },
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
const { failed, rows: results } = checkRegressions(baseline, rows, tolerance);

const pct = (n) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
console.log(`Size regression check (tolerance ${(tolerance * 100).toFixed(1)}%)\n`);
for (const r of results) {
  const cur = r.current === null ? "missing" : String(r.current);
  console.log(`  ${r.status.padEnd(10)} ${r.image}  ${r.codec}  base ${r.baseline} → ${cur}  (${pct(r.deltaPct)})`);
}
if (failed) {
  console.error("\nFAIL: at least one codec regressed or is missing.");
  process.exit(1);
}
console.log("\nOK: no size regressions.");
