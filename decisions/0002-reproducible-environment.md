# 0002 — Reproducible environment via Docker, alongside native install

- Status: accepted
- Date: 2026-07-24

## Context

A codec comparison is only trustworthy if the tool versions are known and repeatable.
Native installs (Homebrew on macOS) are ergonomic for day-to-day work, but they drift
between machines and are hard to pin for others reproducing a comparison.

Some tools are not available as prebuilt packages on every platform (`ect`, standalone
`butteraugli`, NVIDIA `flip`, and `ssimulacra2` from libjxl source), so a single
package manager cannot cover the whole toolbox.

## Decision

Maintain **both**:

- A **native install** (Homebrew) for fast local iteration.
- A committed, multi-stage **`Dockerfile`** as the reproducible specification: the bulk
  of the toolbox from Debian `apt`, Rust tools via `cargo`, and the remainder built from
  source in a builder stage, copied into a slim runtime image.

The Docker image and the harness that runs on top of it are treated as **equally
important deliverables**.

## Consequences

- Anyone can reproduce a comparison with `docker build -t image-tools .` regardless of
  host OS.
- Tool versions are pinned via build args (`LIBJXL_REF`, `ECT_REF`, …).
- The source-build stages are the maintenance cost; they are the parts most likely to
  need iteration when upstream changes.
- A tool that is impractical to package (heavy dependency tree, no apt package) may be
  left out of the image and kept native-only; such omissions are documented.
