import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeOutput } from "../src/exec.js";

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
