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
| `--effort <0..10>` | codec default | Matched encoder effort across codecs that have the knob (higher = slower) |
| `--time-runs <n>` | `1` | Time each codec's encode n times and report the median |
| `--csv <path>` | — | Also write the results as CSV |
| `--html <path>` | — | Write an interactive, self-contained HTML report |
| `--html-max-dim <n>` | `1600` | Downscale embedded report images above this size |
| `--keep` | off | Keep the temporary work directory |

## Interactive HTML report

`--html report.html` produces a single self-contained file (images embedded, no
external assets) that sweeps each codec across a range of quality points and lets
you explore the trade-off interactively. The table still prints and `--csv` still
applies, so one run produces every output; the report's previews are the same
equal-quality results as the table and the CSV:

- a **before/after wipe** between the original and each codec at the target quality,
- **zoom and pan** to inspect artifacts, kept in place while you toggle formats,
- a **format toggle** with live size / bpp / ssimulacra2 / dssim,
- a **difference view** with an amplify slider, an in-browser map of where the selected codec departs from the original,
- a **plain-language takeaway** and, for a batch, an **across-all-images** summary,
- a **rate–distortion chart** (bpp vs ssimulacra2) with one curve per codec,
- a **quality slider** that reads each codec's size at any quality level.

```bash
compare-codecs demos/images --target 90 --html report.html
```

The **difference view** shows, per pixel, `|original − codec|` multiplied by the
amplify factor (1 to 30). It is a display gain, not a metric: at the equal-quality
target the real differences are tiny, so at ×1 the map is nearly black; raising
amplify scales those small values into a visible range so you can see *where* each
codec spends its error. A pixel that is identical stays black at any amplify, and the
map is per-channel, so a color tint points to chroma (color) error and neutral gray to
luma (brightness) error. An amplified, busy map is not a sign of low quality, it just
makes the small, expected differences visible; compare formats at the same amplify for
a fair look.

The report embeds the decoded previews at full resolution so the zoom stays sharp,
which makes large batches heavy. `--html-max-dim <n>` downscales embedded images
above `n` pixels on the longest side (metrics are unaffected; only the previews are
resized), trading zoom detail for a smaller file:

```bash
compare-codecs photos/ --target 90 --html-max-dim 800 --html report.html
```

See `demos/` for a ready-to-run example (run `demos/fetch.sh` first to get the
sample images).

## Output

An ASCII table (and optional CSV), sorted by file size so the smallest wins:

```
+---------+--------------+---------+-------+-------------+---------+-------+--------+--------+-----------+-----------+
| Codec   | Setting      |    Size |   bpp | ssimulacra2 |   dssim | iters | encode |    cpu | enc total | cpu total |
+---------+--------------+---------+-------+-------------+---------+-------+--------+--------+-----------+-----------+
| JPEG XL | -d 1.08      | 15.5 KB | 0.826 |       90.38 | 0.00044 |     6 |  60 ms | 240 ms |    460 ms |    1.86 s |
| jpegli  | -d 0.97      | 21.7 KB | 1.155 |       89.74 | 0.00050 |     7 |  48 ms | 120 ms |    390 ms |    980 ms |
| AVIF    | --min/max 10 | 25.3 KB | 1.349 |       90.39 | 0.00030 |     5 |  50 ms | 150 ms |    280 ms |    840 ms |
| WebP    | -q 97        | 29.8 KB | 1.589 |       89.63 | 0.00036 |     5 |  22 ms |  22 ms |    130 ms |    130 ms |
+---------+--------------+---------+-------+-------------+---------+-------+--------+--------+-----------+-----------+
```

`iters` is the number of binary-search steps taken to reach the equal-quality
setting, each at a different quality; it is **not** a count of timing repetitions.
The timing columns cover a single encode at the found setting (see `--time-runs`).

`encode` is the wall-clock time of the single encode at the target quality, and
`cpu` its CPU time (user + sys). Their ratio shows how much the codec parallelized:
`cpu / encode ≈ 4` means it kept about four cores busy. Both are measured with
`/usr/bin/time` (the `time` package, present in the Docker image); where it is not
available they show `n/a`. The CSV adds `encode_wall_ms` and `encode_cpu_ms`.

`enc total` and `cpu total` are the **total encode effort**: the encoder's wall and
CPU time summed over every encode the search ran, plus the final one, i.e. what it
cost the tool to land this codec on the target. This is **not** a fair speed ranking:
it scales with `iters`, which depends on `--tolerance`, `--max-iterations`, and where
the target falls in the codec's range. For codec speed compare `encode`/`cpu`; for
how much work the run spent, compare the totals. The CSV adds `total_encode_wall_ms`
and `total_encode_cpu_ms`.

Timing is a **single encode** at the target by default, which is noisy. Pass
`--time-runs <n>` to encode n times and report the **median** of the wall and CPU
times, which smooths the run-to-run variation at the cost of n encodes per codec:

```bash
compare-codecs reference.png --target 90 --time-runs 5
```

Unlike the size and quality figures, timing is **not deterministic**: it depends on
the machine, its load, and the tool versions and build flags. CPU time is the
stabler of the two, but treat both as indicative, measure inside the Docker image on
an idle machine for the most comparable numbers, and don't gate CI on them.

## Matched effort

By default each codec encodes at its own effort/speed preset (cjxl `-e 7`, avifenc
`-s 6`, cwebp `-m 4`), which are different points on each codec's speed/size curve, so
cross-codec timing is not directly comparable. `--effort <0..10>` pins one normalized
effort (higher = slower, more thorough) across the codecs that expose the knob:

- **JPEG XL** — `cjxl -e` (1..10)
- **AVIF** — `avifenc -s`, inverted (effort 10 maps to speed 0, the slowest)
- **WebP** — `cwebp -m` (0..6)

jpegli, mozjpeg and HEIC have no comparable knob and keep their defaults. This is not
a claim that the codecs do equal work at the same number, they don't; it replaces each
codec's arbitrary default with one stated setting, so timing and size are read at a
deliberate, comparable operating point:

```bash
compare-codecs reference.png --target 90 --effort 9 --time-runs 3
```

## Size-regression gate

CI fails if a codec's **bytes at equal quality** grow beyond a tolerance (2%) versus
a committed baseline (`demos/baseline.json`), so a change that quietly makes a codec's
output larger is caught. Only size is checked, it is deterministic given the pinned
codec versions in the image; timing is never gated. The check runs on pull requests
that can change codec output (the `Dockerfile`, the comparison sources, or the
baseline), and on `main`. On a pull request it also uploads the HTML report and posts
a sticky comment linking it (a download; open `report.html` locally).

When a change moves sizes on purpose (a codec version bump, a knob change), regenerate
the baseline and commit it:

```bash
compare-codecs demos/images --target 90 --csv results.csv
node bin/check-regression.js demos/baseline.json results.csv --update
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
