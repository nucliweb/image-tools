import { execFileSync } from "node:child_process";

/** First number in the text, or throw if there is none. */
function firstNumber(output, tool) {
  const match = String(output).match(/-?\d+(\.\d+)?/);
  if (!match) throw new Error(`Could not parse ${tool} output: ${JSON.stringify(output)}`);
  return Number(match[0]);
}

/** ssimulacra2 prints a single score in the range -inf..100 (higher is closer). */
export function parseSsimulacra2(output) {
  return firstNumber(output, "ssimulacra2");
}

/** dssim prints "<score>\t<distorted-path>" (lower is closer). */
export function parseDssim(output) {
  return firstNumber(output, "dssim");
}

/** Run ssimulacra2 on two PNG files and return the score. */
export function ssimulacra2(originalPng, distortedPng) {
  const out = execFileSync("ssimulacra2", [originalPng, distortedPng], { encoding: "utf8" });
  return parseSsimulacra2(out);
}

/** Run dssim on two PNG files and return the score. */
export function dssim(originalPng, distortedPng) {
  const out = execFileSync("dssim", [originalPng, distortedPng], { encoding: "utf8" });
  return parseDssim(out);
}
