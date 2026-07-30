# Codec comparison tool

Encodes a reference image with each codec, searching each codec's quality knob
until the decoded image reaches an **equal perceptual target** (ssimulacra2), then
reports file size against quality. Comparing at an equal target is more meaningful
than comparing each codec's own quality scale, since the scales are not equivalent.

## Requirements

The encoders, decoders and metric tools on `PATH`: `cjxl`/`djxl`, `cjpegli`/`djpegli`,
`avifenc`/`avifdec`, `cwebp`/`dwebp`, `mozjpeg-cjpeg`, `heif-enc`/`heif-convert`,
`ssimulacra2`, `dssim`, plus Node.js (>= 18). All of these are present in the project's
Docker image, where the CLI is installed as `compare-codecs`.

## Usage

```bash
# Inside the Docker image:
compare-codecs reference.png --target 90

# A whole folder (and/or several images) at once, with a batch summary:
compare-codecs images/ --target 90 --csv results.csv

# From a checkout (Node on PATH, tools on PATH):
node compare/bin/compare.js reference.png --target 90 --csv results.csv
```

Each argument may be a PNG file or a directory of PNGs. With more than one image,
a per-image table is printed for each, followed by a **batch summary**: average
bpp, how many images each codec wins (smallest file), and mean size savings versus
mozjpeg. A codec that cannot land within tolerance of the target for an image (its
range is exhausted) is marked with `*`.

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `-t, --target <n>` | `90` | Target ssimulacra2 score (higher is closer to the original) |
| `-c, --codecs <list>` | all | Comma-separated subset of `jxl,avif,webp,jpegli,mozjpeg,heic` |
| `--tolerance <n>` | `0.5` | Stop searching once within this of the target |
| `--max-iterations <n>` | `10` | Maximum search steps per codec |
| `--csv <path>` | — | Also write the results as CSV |
| `--keep` | off | Keep the temporary work directory |

## Output

A Markdown table (and optional CSV), sorted by file size so the smallest wins:

```
| Codec   | Setting   | Size    | bpp   | ssimulacra2 | dssim   | iters |
| JPEG XL | -d 1.08   | 15.5 KB | 0.826 | 90.38       | 0.00044 | 6     |
| jpegli  | -d 0.97   | 21.7 KB | 1.155 | 89.74       | 0.00050 | 7     |
| AVIF    | --min/max 10 | 25.3 KB | 1.349 | 90.39    | 0.00030 | 5     |
| WebP    | -q 97     | 29.8 KB | 1.589 | 89.63       | 0.00036 | 5     |
```

## How it works

Each codec exposes one quality knob that is monotonic against perceptual score:

- `cjxl` / `cjpegli` use `-d` (butteraugli distance): lower distance, higher quality.
- `avifenc` uses the color quantizer via `--min`/`--max` (0..63, 0 = lossless): higher
  quantizer, lower quality. This is the only knob common to avifenc 0.11 and 1.x.
- `cwebp`, `heif-enc` and mozjpeg's `cjpeg` use a `0..100` quality: higher value, higher
  quality. mozjpeg is resolved as `mozjpeg-cjpeg`, or its keg-only path on macOS.

For each codec the tool binary-searches the knob: encode, decode back to PNG, strip
the PNG to its critical chunks (so every codec's output is readable by ssimulacra2),
measure, and adjust. If the target is outside a codec's reachable range, it settles at
the closest bound (visible as `iters` hitting the max with the knob pinned).

## Scope and assumptions

- Input is a PNG in sRGB. Ancillary chunks (ICC profile, chromaticities) are stripped
  before measuring, so wide-gamut inputs are treated as sRGB.
- The search target metric is ssimulacra2; dssim is reported alongside for reference.
- Codec versions affect the operating point. Use the Docker image for reproducible
  numbers; a native install will differ with its tool versions.
