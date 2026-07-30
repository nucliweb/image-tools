import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

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
