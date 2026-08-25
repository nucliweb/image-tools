# image-tools

[![CI](https://github.com/nucliweb/image-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/nucliweb/image-tools/actions/workflows/ci.yml)

A reproducible toolbox and comparison harness for image codecs and quality validation. It bundles every major image encoder, decoder and optimizer together with the perceptual quality metrics, so codec comparisons are apples-to-apples.

## What it is

Two parts that share one environment:

1. **The toolbox**: encoders, decoders and optimizers (JPEG XL, AVIF, WebP, jpegli, mozjpeg, HEIC, plus PNG/GIF optimizers) alongside quality validators (ssimulacra2, dssim, butteraugli, FLIP, perceptual diffs). See [`INVENTORY.md`](INVENTORY.md) for the full list.
2. **The comparison tool** (`compare-codecs`): encodes an image with each codec until the result reaches an **equal perceptual quality** target, then reports file size versus quality, with an optional interactive HTML report.

Comparing codecs at their own quality scales is misleading, because those scales are not equivalent. `compare-codecs` instead tunes every codec to the same ssimulacra2 score, so you compare **bytes at equal quality**.

## Quick start (Docker)

The Docker image is the reproducible way to get every tool at a known version.

```bash
docker build -t image-tools .

# Drop into a shell with every tool on PATH, with the current folder mounted:
docker run --rm -it -v "$PWD:/work" image-tools
```

Inside the container:

```bash
compare-codecs my-image.png --target 90 --html report.html
```

The entrypoint is `bash`. To run a single command from the host without an interactive shell, override the entrypoint:

```bash
docker run --rm -v "$PWD:/work" --entrypoint bash image-tools -c 'compare-codecs /work/photo.png --target 90'
```

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

# Interactive report: wipe, format toggle, rate–distortion chart, quality slider
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

- **Unit tests** run on every push and pull request via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on the current Node LTS.
- **Integration tests** exercise the full pipeline against the actual codecs and self-generated images; they skip cleanly where the codecs are not installed.
- **Image E2E** ([`.github/workflows/image.yml`](.github/workflows/image.yml), on `main` and on demand) builds the Docker image, runs the test suite inside it, and finishes with `smoke-test.sh`, so a green run proves every bundled tool works end to end.

## Repository layout

| Path | What it is |
| --- | --- |
| `Dockerfile` | The reproducible environment (multi-stage build) |
| `compare/` | The comparison tool (Node.js) and its demo |
| `smoke-test.sh` | Runtime verification of the toolbox |
| `INVENTORY.md` | Full inventory of the bundled tools |
| `decisions/` | Architecture decision records (ADRs) |
| `.github/workflows/` | CI: unit + integration tests, and the image E2E build |
| `ROADMAP.md` | Ideas under consideration |
| `CONTRIBUTING.md` | Commit convention and workflow |

## License

MIT.
