import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve a command to a runnable path from one or more candidates. A candidate
 * with a slash is checked as a file path; a bare name is looked up on PATH. Lets
 * a codec name a tool that lives at different locations across environments
 * (e.g. mozjpeg's cjpeg, keg-only on macOS but on PATH in the image).
 */
export function resolveCommand(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const pathDirs = (process.env.PATH || "").split(":").filter(Boolean);
  for (const cand of list) {
    if (cand.includes("/")) {
      if (existsSync(cand)) return cand;
    } else if (pathDirs.some((dir) => existsSync(join(dir, cand)))) {
      return cand;
    }
  }
  throw new Error(`None of these commands were found: ${list.join(", ")}`);
}

/** Run a command, discarding stdout; throw with stderr on failure. */
export function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  } catch (err) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${err.stderr || err.message}`);
  }
}

/**
 * A one-line reason for a failed command, for reports: the stderr that run() and
 * runTimed() put after "failed: ", reduced to its first line mentioning an error
 * (encoders tend to print warnings first), or its last line when none does.
 */
export function failureReason(err) {
  const message = String(err?.message ?? err);
  const at = message.indexOf(" failed: ");
  const detail = at >= 0 ? message.slice(at + " failed: ".length) : message;
  const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /error/i.test(l)) ?? lines.at(-1) ?? message;
}

const TIME_BIN = "/usr/bin/time";
const timingAvailable = existsSync(TIME_BIN);

/**
 * The `/usr/bin/time` arguments that print the POSIX real/user/sys block plus the
 * peak resident memory. GNU time takes a format (`%M` is in kilobytes); BSD time
 * (macOS, the BSDs) adds a rusage report with `-l`, in bytes. Elsewhere only `-p`.
 */
function timeArgs() {
  if (!timingAvailable) return null;
  const version = spawnSync(TIME_BIN, ["--version"], { encoding: "utf8" });
  if (/GNU/.test(`${version.stdout}${version.stderr}`)) return ["-f", "real %e\nuser %U\nsys %S\nmaxrss %M"];
  if (/darwin|bsd/.test(process.platform)) return ["-l", "-p"];
  return ["-p"];
}
const TIME_ARGS = timeArgs();

/**
 * Parse the stderr of `/usr/bin/time` into wall time and CPU time (user + sys) in
 * milliseconds, and the peak resident memory in bytes. The POSIX `-p` format is a
 * trailing block of `real`/`user`/`sys` lines, emitted by both GNU and BSD time, so
 * this reads the last such block and ignores any tool output printed before it.
 * Peak memory is GNU's `maxrss` line (kilobytes) or BSD's "maximum resident set
 * size" (bytes). Returns nulls for what is absent.
 * @returns {{ wallMs: number | null, cpuMs: number | null, peakBytes: number | null }}
 */
export function parseTimeOutput(stderr) {
  const last = (key) => {
    const matches = [...stderr.matchAll(new RegExp(`^${key}\\s+([\\d.]+)`, "gm"))];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  };
  const real = last("real");
  const user = last("user");
  const sys = last("sys");
  const gnuKb = last("maxrss");
  const bsd = [...stderr.matchAll(/^\s*(\d+)\s+maximum resident set size/gm)].at(-1);
  const peakBytes = gnuKb !== null ? gnuKb * 1024 : bsd ? Number(bsd[1]) : null;
  if (real === null || user === null || sys === null) return { wallMs: null, cpuMs: null, peakBytes };
  return { wallMs: real * 1000, cpuMs: (user + sys) * 1000, peakBytes };
}

/**
 * Run a command under `/usr/bin/time` and return how long it took, wall time and
 * CPU time (user + sys) in milliseconds, and its peak resident memory in bytes.
 * Where `/usr/bin/time` is unavailable the command still runs and these are
 * reported as null, so callers degrade gracefully. Throws with stderr on failure,
 * like run().
 * @returns {{ wallMs: number | null, cpuMs: number | null, peakBytes: number | null }}
 */
export function runTimed(cmd, args) {
  if (!timingAvailable) {
    run(cmd, args);
    return { wallMs: null, cpuMs: null, peakBytes: null };
  }
  const res = spawnSync(TIME_BIN, [...TIME_ARGS, cmd, ...args], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (res.error) throw new Error(`${cmd} ${args.join(" ")} failed: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${res.stderr || `exit ${res.status}`}`);
  }
  return parseTimeOutput(res.stderr || "");
}
