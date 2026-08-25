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

const TIME_BIN = "/usr/bin/time";
const timingAvailable = existsSync(TIME_BIN);

/**
 * Parse the stderr of `/usr/bin/time -p` into wall time and CPU time (user + sys)
 * in milliseconds. The POSIX `-p` format is a trailing block of `real`/`user`/`sys`
 * lines and is emitted by both GNU and BSD time, so this reads the last such block
 * and ignores any tool output printed before it. Returns nulls when it is absent.
 * @returns {{ wallMs: number | null, cpuMs: number | null }}
 */
export function parseTimeOutput(stderr) {
  const last = (key) => {
    const matches = [...stderr.matchAll(new RegExp(`^${key}\\s+([\\d.]+)`, "gm"))];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  };
  const real = last("real");
  const user = last("user");
  const sys = last("sys");
  if (real === null || user === null || sys === null) return { wallMs: null, cpuMs: null };
  return { wallMs: real * 1000, cpuMs: (user + sys) * 1000 };
}

/**
 * Run a command under `/usr/bin/time -p` and return how long it took: wall time
 * and CPU time (user + sys) in milliseconds. Where `/usr/bin/time` is unavailable
 * the command still runs and timing is reported as null, so callers degrade
 * gracefully. Throws with stderr on failure, like run().
 * @returns {{ wallMs: number | null, cpuMs: number | null }}
 */
export function runTimed(cmd, args) {
  if (!timingAvailable) {
    run(cmd, args);
    return { wallMs: null, cpuMs: null };
  }
  const res = spawnSync(TIME_BIN, ["-p", cmd, ...args], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (res.error) throw new Error(`${cmd} ${args.join(" ")} failed: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${res.stderr || `exit ${res.status}`}`);
  }
  return parseTimeOutput(res.stderr || "");
}
