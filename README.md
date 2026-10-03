# image-tools

[![CI](https://github.com/nucliweb/image-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/nucliweb/image-tools/actions/workflows/ci.yml)

A reproducible toolbox and comparison harness for image codecs and quality validation. It bundles every major image encoder, decoder and optimizer together with the perceptual quality metrics, so codec comparisons are apples-to-apples.

## What it is

Two parts that share one environment:

1. **The toolbox**: encoders, decoders and optimizers (JPEG XL, AVIF, WebP, jpegli, mozjpeg, HEIC, plus PNG/GIF optimizers) alongside quality validators (ssimulacra2, dssim, butteraugli, FLIP, perceptual diffs). See [`INVENTORY.md`](INVENTORY.md) for the full list.
2. **The comparison tool** (`compare-codecs`): encodes an image with each codec until the result reaches an **equal perceptual quality** target, then reports file size versus quality, with an optional interactive HTML report.

Comparing codecs at their own quality scales is misleading, because those scales are not equivalent. `compare-codecs` instead tunes every codec to the same ssimulacra2 score, so you compare **bytes at equal quality**.

## Quick start (Docker)

The Docker image is the reproducible way to get every tool at a known version. A prebuilt multi-arch image (amd64 and arm64, so it runs natively on Apple Silicon) is published to the GitHub Container Registry from `main`:

```bash
docker pull ghcr.io/nucliweb/image-tools

# Drop into a shell with every tool on PATH, with the current folder mounted:
docker run --rm -it -v "$PWD:/work" ghcr.io/nucliweb/image-tools
```

Inside the container:

```bash
compare-codecs my-image.png --target 90 --html report.html
```

The entrypoint is `bash`. To run a single command from the host without an interactive shell, override the entrypoint:

```bash
docker run --rm -v "$PWD:/work" --entrypoint bash ghcr.io/nucliweb/image-tools -c 'compare-codecs /work/photo.png --target 90'
```

`latest` follows `main`. Every published build is also tagged `sha-<short commit>`, so a comparison can cite the exact image it ran on and be reproduced later. Each release publishes its version too (`0.1.0`, and `0.1` for the latest patch of that minor version). Sizes at equal quality can differ slightly between amd64 and arm64 (encoders take different SIMD paths), so compare numbers produced on the same architecture.

To build the image yourself instead, see [Building and verifying the image](#building-and-verifying-the-image).

## Native use

The same tools run natively (see [`INVENTORY.md`](INVENTORY.md) for what a Homebrew setup provides). The comparison tool needs Node.js ≥ 18 and the codecs on `PATH`:

```bash
node compare/bin/compare.js my-image.png --target 90 --html report.html
```

## Commands

### `compare-codecs`: compare codecs at equal quality

```
compare-codecs <image-or-dir...> [options]

  -t, --target <n>          Target ssimulacra2 score (default: 90)
  -c, --codecs <list>       Comma-separated: jxl,avif,webp,jpegli,mozjpeg,heic (default: all)
      --tolerance <n>       Stop when within this of the target (default: 0.5)
      --max-iterations <n>  Max search steps per codec (default: 10)
      --effort <0..10>      Matched encoder effort across codecs (jxl/avif/webp); higher = slower
      --time-runs <n>       Time each codec's encode n times, report the median (default: 1)
      --csv <path>          Also write the results as CSV
      --html <path>         Write an interactive, self-contained HTML report
      --keep                Keep the temporary work directory
  -h, --help                Show this help
```

Each argument is a PNG file or a directory of PNGs. Examples:

```bash
# One image: an ASCII table sorted by size (smallest wins)
compare-codecs photo.png --target 90

# A whole folder: per-image tables plus a batch summary (avg bpp, wins, savings)
compare-codecs images/ --target 90 --csv results.csv

# Interactive report: wipe, format toggle, difference view, rate–distortion chart, quality slider
compare-codecs images/ --target 90 --html report.html
```

The comparison tool has its own detailed docs in [`compare/README.md`](compare/README.md).

### Demo

```bash
cd compare/demos
./fetch.sh                                   # download the sample images
compare-codecs images --target 90 --html report.html
```

`compare/demos/example-report.html` is a small pre-generated report you can open directly.

### Building and verifying the image

```bash
docker build -t image-tools .

# Prove every tool actually runs (encode → decode → measure), not just that it built:
docker run --rm --entrypoint bash image-tools -c "$(cat smoke-test.sh)"
```

## Testing

Three layers, all run in CI:

```bash
# Unit tests: pure logic (search, metrics, report generation), zero external tools
cd compare && node --test

# Integration tests: real encode → decode → measure; skip automatically when codecs are absent
cd compare && node --test test/integration.test.js
```

- **Unit tests** run on every push and pull request via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on the current Node LTS. That runner has no codecs, so the integration tests skip there.
- **Integration tests** exercise the full pipeline against the actual codecs and self-generated images; they skip cleanly where the codecs are not installed.
- **Image E2E** ([`.github/workflows/image.yml`](.github/workflows/image.yml), on `main` and on demand) builds the Docker image for amd64 and arm64, each on its own native runner, runs the test suite inside it (where the integration tests do run), and finishes with `smoke-test.sh`, so a green run proves every bundled tool works end to end on both architectures. On `main`, only an image that passes is published to GHCR.

## Continuous comparison

Two more workflows run `compare-codecs` on the demo images inside the built image:

- **Size-regression gate** ([`.github/workflows/regression.yml`](.github/workflows/regression.yml)) fails when a codec's bytes at equal quality grow more than 2% over the committed baseline (`compare/demos/baseline.json`), or its achieved ssimulacra2 score drops more than 0.5 points, or the run's target differs from the baseline's. It runs on pull requests that can change codec output, on `main`, and on demand. On a pull request it also posts a sticky comment with the size check and a link to download the HTML report. See [`compare/README.md`](compare/README.md#size-regression-gate) for how to regenerate the baseline after a deliberate change.
- **Codec comparison** ([`.github/workflows/comparison.yml`](.github/workflows/comparison.yml)) runs weekly and on demand (with a configurable target and effort), writes the results table to the job summary, and uploads the HTML report and CSV as artifacts. It reports only; it never fails the build.

Only file size and achieved quality are gated: both are deterministic given the pinned codec versions in the image. Timing depends on the runner and is informational.

## Repository layout

| Path | What it is |
| --- | --- |
| `Dockerfile` | The reproducible environment (multi-stage build) |
| `compare/` | The comparison tool (Node.js) and its demo |
| `smoke-test.sh` | Runtime verification of the toolbox |
| `INVENTORY.md` | Full inventory of the bundled tools |
| `decisions/` | Architecture decision records (ADRs) |
| `compare/demos/baseline.json` | Committed sizes the regression gate checks against |
| `.github/workflows/` | CI: unit tests, the image E2E build, the size-regression gate and the weekly comparison |
| `ROADMAP.md` | Ideas under consideration |
| `CONTRIBUTING.md` | Commit convention and workflow |

## License

MIT, see [`LICENSE`](LICENSE).
