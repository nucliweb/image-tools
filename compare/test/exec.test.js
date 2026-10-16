import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeOutput, failureReason } from "../src/exec.js";

test("parses POSIX `time -p` output into wall and cpu milliseconds", () => {
  const out = "real 0.50\nuser 0.45\nsys 0.03\n";
  assert.deepEqual(parseTimeOutput(out), { wallMs: 500, cpuMs: 480 });
});

test("cpu time is user + sys, so it can exceed wall time when multithreaded", () => {
  const out = "real 1.20\nuser 2.00\nsys 0.30\n";
  assert.deepEqual(parseTimeOutput(out), { wallMs: 1200, cpuMs: 2300 });
});

test("reads the final timing block, ignoring earlier tool output", () => {
  const out = "encoder: reticulating splines\nreal 0.10\nuser 0.08\nsys 0.01\n";
  assert.deepEqual(parseTimeOutput(out), { wallMs: 100, cpuMs: 90 });
});

test("returns nulls when timing is absent", () => {
  assert.deepEqual(parseTimeOutput("no timing here\n"), { wallMs: null, cpuMs: null });
});

test("failureReason picks the encoder's error line out of a failed command", () => {
  const err = new Error(
    "avifenc -c svt in.png out.avif failed: WARNING: --min and --max are deprecated\n" +
      "Svt[error]: Error Instance 1: Source Height must be even for YUV_420 colorspace\n" +
      "ERROR: Failed to encode image: Encoding of color planes failed\n",
  );
  assert.equal(failureReason(err), "Svt[error]: Error Instance 1: Source Height must be even for YUV_420 colorspace");
});

test("failureReason falls back to the last line, without the command echo", () => {
  assert.equal(failureReason(new Error("cwebp -q 80 in out failed: exit 1")), "exit 1");
  assert.equal(failureReason(new Error("None of these commands were found: cjpeg")), "None of these commands were found: cjpeg");
});
