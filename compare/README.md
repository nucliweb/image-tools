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

A codec that fails on an image (its encoder rejects the input or crashes) does not stop the run: its row reads `failed`, a `†` note below the table gives the encoder's error, the CSV keeps the row with empty metrics and the message in its `error` column, and the batch summary, BD-rate and HTML report leave it out (the report's summary shows on how many images each codec was measured, and only one measured on all of them is marked best).

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `-t, --target <n>` | `90` | Target ssimulacra2 score (higher is closer to the original) |
| `-c, --codecs <list>` | the six formats | Comma-separated subset of `jxl,avif,webp,jpegli,mozjpeg,heic`, plus any [opt-in variant](#opt-in-variants); `all` runs every codec and variant |
| `--tolerance <n>` | `0.5` | Stop searching once within this of the target |
| `--max-iterations <n>` | `10` | Maximum search steps per codec |
| `--effort <0..10>` | codec default | Matched encoder effort across codecs that have the knob (higher = slower) |
| `--time-runs <n>` | `1` | Time each codec's encode n times and report the median |
| `--rd <list>` | — | Rate-distortion mode: search each codec at every target in the list; with `--html`, the report shows the encodes at the target closest to `--target` |
| `--csv <path>` | — | Also write the results as CSV |
| `--html <path>` | — | Write an interactive, self-contained HTML report |
| `--html-max-dim <n>` | `1600` | Downscale embedded report images above this size |
| `--keep` | off | Keep the temporary work directory |

## Rate-distortion mode

A single target compares codecs at one operating point, and the winner can change with the quality you aim for. `--rd` runs the equal-quality search at **each target in a list**, so every codec is measured at the same quality points, and reports the whole size-versus-quality curve:

```bash
compare-codecs images/ --rd 70,80,85,90,95 --csv rd.csv
```

For each image it prints the bpp each codec needs at every target, and its **BD-rate** against mozjpeg (the first selected codec when mozjpeg is not among `--codecs`):

```
+---------+---------+---------+---------+---------+---------+--------------------+
| Codec   | bpp @70 | bpp @80 | bpp @85 | bpp @90 | bpp @95 | BD-rate vs mozjpeg |
+---------+---------+---------+---------+---------+---------+--------------------+
| AVIF    |   0.416 | 0.654 * |   0.942 |   1.657 |   7.378 |             -33.8% |
| HEIC    | 0.424 * | 0.649 * |   1.043 |   2.420 | 4.716 * |             -32.9% |
| JPEG XL |   0.566 |   0.862 |   1.114 |   1.611 | 2.417 * |             -26.6% |
| WebP    |   0.588 |   0.876 |   1.320 | 2.662 * | 2.662 * |             -13.6% |
| jpegli  |   0.733 |   1.103 |   1.389 |   1.966 | 2.794 * |              -8.2% |
| mozjpeg |   0.667 | 1.150 * |   1.536 |   2.794 |   5.897 |           baseline |
+---------+---------+---------+---------+---------+---------+--------------------+
```

That is `cid22-friends.png` in the Docker image (0.4.0). AVIF needs the fewest bits from 70 to 85, and JPEG XL is smaller from 90 up, so a single-target run at the default 90 and one at 70 name different winners. Jake Archibald's [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) finds the same pattern across his photographs: AVIF ahead at ssimulacra2 70, with JPEG XL closing the gap at very high quality. A `*` marks a target the codec could not reach (its range is exhausted), as in the single-target table; the curve uses the quality the codec actually reached there, not the target.

BD-rate (the Bjøntegaard delta rate) is the average difference in bits at equal quality across the range both curves cover: `-30%` means the codec needs, on average, 30% fewer bits than the baseline for the same ssimulacra2 score. Rate is interpolated piecewise-linearly in the log domain between the measured points, rather than with the classic cubic fit, so it stays well-behaved with few targets and never overshoots. A codec whose curve does not overlap the baseline's (for example, one pinned at its range bound at every target) shows `n/a`.

With more than one image, a summary prints each codec's **mean BD-rate** across the images it could be rated on. `--csv` writes one row per image, codec and target (`image,codec,target,setting,bytes,bpp,ssimulacra2,dssim,reached,iterations`), ready to plot. The cost is one equal-quality search per target, so five targets take about five times as long as a single-target run. With `--html`, the [report](#interactive-html-report) plots these curves instead of its fixed-knob sweep:

```bash
compare-codecs images/ --rd 70,80,85,90,95 --html rd.html
```

Its chart dots are the equal-quality encodes at each target, the same points as the table and the CSV, and the readout under the chart and the across-all-images summary add each codec's BD-rate and mean BD-rate. The viewer shows each codec's encode at the target closest to `--target` (90 by default), so pass a list that includes the quality you want to inspect.

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
- a **rate–distortion chart** (bpp vs ssimulacra2) with one curve per codec: a fixed-knob sweep, or the equal-quality curves and BD-rates of [rate-distortion mode](#rate-distortion-mode) with `--rd`,
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

Effort moves sizes as well as times, and not equally across codecs, so a ranking at the defaults is not a ranking at maximum effort. [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) compares at each encoder's maximum effort (`avifenc -s 0`) and finds that "libjxl's higher efforts are much slower, use a lot more memory, and barely improve the result"; read results at the defaults as a comparison of the presets most tools ship with.

## Opt-in variants

The default set compares six formats, one encoder configuration each. A variant is one of them with a single setting changed, so a comparison can isolate what that setting is worth on your images. Variants reuse the base codec's quality knob, decoder and effort mapping, and run only when named in `--codecs` (or with `--codecs all`), so the default comparison and the regression baseline are unaffected. The weekly comparison runs them all.

```bash
compare-codecs images/ --target 90 --codecs webp,webp-sharp
```

### WebP sharp YUV (`webp-sharp`)

**What it changes.** Lossy WebP always stores color as YUV 4:2:0: brightness (Y) at full resolution and color (U, V) at half resolution in both directions, one color sample per 2×2 block of pixels ([chroma subsampling](https://en.wikipedia.org/wiki/Chroma_subsampling)). By default `cwebp` converts RGB to YUV and simply averages each block's color. On an edge between saturated colors, such as colored text or a thin line on a light background, that average is wrong for every pixel in the block, and once the decoder upsamples the color back, it bleeds across the edge and the edge darkens. `-sharp_yuv` instead adjusts Y, U and V together so that the image *after* upsampling is as close as possible to the original RGB. The bitstream is ordinary WebP, so every decoder reads it; only the encoder does more work.

**What it is worth on the demo images** (target ssimulacra2 90, image 0.2.0):

| Image | WebP | WebP sharp YUV |
| --- | --- | --- |
| `cid22-friends.png` (photo, people) | 85.2 KB, 89.4 * | **76.5 KB**, 89.9 |
| `cid22-church.png` (photo, detail) | 92.0 KB, 88.9 * | **83.4 KB**, 89.6 |
| `cid22-blossoms.png` (photo, color) | 115.4 KB, 76.9 * | 119.4 KB, **85.9** * |
| `forest-leaves.png` (texture) | 735.8 KB, 89.5 | **657.9 KB**, 90.3 (−11%) |
| `corporate-memphis.png` (illustration) | 45.7 KB, 85.9 * | 45.8 KB, **89.5** |
| `report-ui.png` (UI, text) | 114.8 KB, 77.4 * | 123.4 KB, **89.4** * |
| `pipeline-diagram.png` (diagram) | 61.6 KB, 73.5 * | 70.9 KB, **86.2** * |

Plain WebP reaches the target only on the texture, where sharp YUV is 11% smaller at the same quality. On every other image plain WebP stops short even at `-q 99`–`100`, photographs included, and sharp YUV raises the ceiling: on the people and church photographs it reaches the target with 9–10% fewer bytes than plain WebP's best attempt, and on the UI screenshot it lifts the score from 77 to 89. Where it still falls short, the extra bytes buy quality that was unreachable before, so those rows are not a size comparison. Encoding takes about 1.2–2× as long.

**Takeaway.** Sharp YUV is close to a free improvement for lossy WebP, and valuable wherever color changes sharply: graphics and text, but also detailed photographs, where it is what lets WebP reach high quality at all. It does not remove the 4:2:0 limit: on the blossoms photograph, the UI and the diagram, a format that keeps full-resolution color (AVIF, which `avifenc` encodes as 4:4:4 by default, or JPEG XL) still does better.

**Using it.** `cwebp -sharp_yuv`; in [sharp](https://sharp.pixelplumbing.com/api-output/#webp), `webp({ smartSubsample: true })` ("use high quality chroma subsampling", off by default); for 4:2:0 AVIF, `avifenc --sharpyuv`.

**References.** [`cwebp` documentation](https://developers.google.com/speed/webp/docs/cwebp) (`-sharp_yuv`: "Use more accurate and sharper RGB->YUV conversion", slower than the default); [libwebp's `sharpyuv` library](https://github.com/webmproject/libwebp/tree/main/sharpyuv), which `libavif` also uses.

### HEIC 4:4:4 (`heic-444`)

**What it changes.** `heif-enc` asks its HEVC encoder (x265) for 4:2:0 chroma by default, the same half-resolution color as lossy WebP. `-p chroma=444` passes x265 its `chroma=444` parameter and keeps color at full resolution. HEVC carries 4:4:4 only in its [Range Extensions](https://hevc.hhi.fraunhofer.de/rext) (RExt) profiles, not in the Main and Main 10 profiles most hardware decoders implement, so a decoder needs RExt support to read it; `heif-info` reports the result as `YCbCr, 4:4:4`.

**What it is worth on the demo images** (target ssimulacra2 90, image 0.2.0, decoded with libheif):

| Image | HEIC (4:2:0) | HEIC 4:4:4 |
| --- | --- | --- |
| `cid22-friends.png` (photo, people) | 77.4 KB, 90.0 | **47.9 KB**, 90.1 (−38%) |
| `cid22-church.png` (photo, detail) | **69.3 KB**, 90.1 | 72.7 KB, 90.4 (+5%) |
| `cid22-blossoms.png` (photo, color) | 190.3 KB, 82.3 * | **124.1 KB**, 90.0 |
| `forest-leaves.png` (texture) | 696.5 KB, 90.5 | 683.8 KB, 90.2 (−2%) |
| `corporate-memphis.png` (illustration) | 67.1 KB, 88.0 * | **25.0 KB**, 89.7 |
| `report-ui.png` (UI, text) | 194.3 KB, 83.2 * | **82.1 KB**, 90.2 |
| `pipeline-diagram.png` (diagram) | 94.8 KB, 73.4 * | **84.2 KB**, 89.7 |

4:4:4 reaches the target on all seven images, against three for 4:2:0. It is 38% smaller on the people photograph, and on the UI screenshot it is 58% smaller *and* reaches a quality 4:2:0 cannot. It is larger only on the church photograph (+5%), where halving the color resolution loses little and 4:2:0 keeps its byte advantage. Elsewhere, at this quality level, halving the color resolution does not save bytes; it costs them, because the search has to raise the quality setting to win back the lost color (`-q 94–97` for 4:2:0 against `-q 57–75` for 4:4:4 on the four images 4:2:0 cannot reach). Encoding takes up to about 1.4× as long.

**The decoder matters too.** The harness decodes with libheif. Decoding the same files with Apple's ImageIO (`sips`, macOS 27.0.1) gives the same score for 4:4:4 (within ±0.5), but 1.5 to 8.4 points *lower* for 4:2:0 on six of the seven images (blossoms photograph 82.3 → 73.9, illustration 88.0 → 81.5, report UI 83.2 → 77.8): Apple upsamples the color differently from libheif. A 4:2:0 HEIC therefore looks worse on an Apple device than the harness measures, and 4:4:4 avoids the gap.

**Takeaway.** For HEIC at high quality, 4:4:4 is almost always smaller and better, and Apple's decoder reads it. Check the decoders you target before relying on it, since 4:4:4 needs HEVC RExt and many hardware decoders only implement Main and Main 10.

**Using it.** `heif-enc -p chroma=444`; in libheif's API, the x265 encoder parameter `chroma` (`heif-enc -P` lists it, `{ 420, 422, 444 }`, default 420).

**References.** [HEVC Format Range Extensions](https://hevc.hhi.fraunhofer.de/rext) (Fraunhofer HHI: RExt adds 4:0:0, 4:2:2 and 4:4:4); [libheif](https://github.com/strukturag/libheif); [x265 `--input-csp`](https://x265.readthedocs.io/en/master/cli.html#cmdoption-input-csp), the color space x265 encodes.

### AVIF rav1e (`avif-rav1e`)

**What it changes.** AVIF is the AV1 format, and AV1 has several independent encoders. `avifenc` auto-selects one from those libavif was built with, which in the image is **aom** (libaom, the Alliance for Open Media reference encoder); `-c rav1e` selects **[rav1e](https://github.com/xiph/rav1e)** instead, a Rust encoder from Xiph that describes itself as "the fastest and safest AV1 encoder" and is the engine behind pure-Rust tools such as [cavif](https://github.com/kornelski/cavif-rs). The bitstream is AV1 either way, decoded by the same decoders; only the encoder's decisions differ. The variant keeps AVIF's quantizer knob and speed mapping, and needs an `avifenc` built with rav1e (`avifenc --version` lists `rav1e [enc]`; Homebrew's is built without it).

**What it is worth on the demo images** (target ssimulacra2 90, image 0.2.0, both at avifenc's default speed 6; encode time is the median of five runs):

| Image | AVIF (aom) | AVIF rav1e | Encode time |
| --- | --- | --- | --- |
| `cid22-friends.png` (photo, people) | 53.0 KB, 90.0 | **51.8 KB**, 90.2 (−2%) | 130 ms → 1.00 s |
| `cid22-church.png` (photo, detail) | 66.5 KB, 89.7 | **64.6 KB**, 89.7 (−3%) | 130 ms → 980 ms |
| `cid22-blossoms.png` (photo, color) | **125.0 KB**, 89.7 | 130.4 KB, 90.0 (+4%) | 190 ms → 1.60 s |
| `forest-leaves.png` (texture) | 805.2 KB, 90.4 | **771.2 KB**, 90.2 (−4%) | 560 ms → 7.55 s |
| `corporate-memphis.png` (illustration) | **18.7 KB**, 89.9 | 26.6 KB, 90.5 (+43%) | 70 ms → 1.84 s |
| `report-ui.png` (UI, text) | **62.6 KB**, 89.9 | 105.5 KB, 90.2 (+69%) | 1.26 s → 2.84 s |
| `pipeline-diagram.png` (diagram) | **61.3 KB**, 90.1 | 88.5 KB, 90.0 (+44%) | 110 ms → 2.35 s |

On photographs and the texture rav1e is within a few percent of aom, slightly smaller on three of the four. On flat graphics and text aom is far ahead, 43–69% smaller. rav1e is also 2–26× slower here, and its CPU time equals its wall time, so it ran on one core, while aom spread the same work over several.

**Why the gap on graphics?** AV1 has tools aimed at screen content, such as palette mode and intra block copy. libaom counts the 16×16 blocks with few colors and turns them on when enough of the image qualifies ([`encoder.c`](https://aomedia.googlesource.com/aom/+/refs/heads/main/av1/encoder/encoder.c), `allow_screen_content_tools`), while using palette mode is still an [open rav1e issue](https://github.com/xiph/rav1e/issues/1066). They explain only part of it, though: turning them off in aom (`-a enable-palette=0 -a enable-intrabc=0`) grows the UI screenshot by 18%, still far below rav1e, and leaves the illustration and the diagram byte-identical. The rest comes from the encoders' overall decisions rather than any single tool, which is why measuring beats reading feature lists.

**Takeaway.** The encoder matters as much as the format: "AVIF" is not one size at a given quality. With these builds, aom is the better default for AVIF, both smaller on graphics and faster; rav1e is competitive on photographs.

**Using it.** `avifenc -c rav1e` (or `-c aom`, `-c svt`, depending on the build); in [cavif](https://github.com/kornelski/cavif-rs), rav1e is the only encoder.

**References.** [`avifenc` manual](https://github.com/AOMediaCodec/libavif/blob/main/doc/avifenc.1.md) (`-c`: "Possible values depend on the codecs enabled at build time"); [rav1e](https://github.com/xiph/rav1e); [libaom](https://aomedia.googlesource.com/aom/).

### AVIF SVT-AV1 (`avif-svt`)

**What it changes.** [SVT-AV1](https://gitlab.com/AOMediaCodec/SVT-AV1) is the third AV1 encoder libavif can use (`avifenc -c svt`), after aom and rav1e. It encodes 4:2:0 only: its `--color-format` documentation reads "only yuv420 is supported at this time" ([`Parameters.md`](https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md)). `avifenc` defaults to 4:4:4 for PNG input, so `-c svt` alone fails ("Only support 420 now"), and the variant passes `-y 420`. In 4:2:0 it also rejects odd dimensions ("Source Height must be even for YUV_420 colorspace"), which aom accepts; on the 1200×675 diagram the variant fails and the run reports it.

**What it is worth on the demo images** (target ssimulacra2 90, image 0.3.0). The middle column forces aom to 4:2:0 too (`-y 420`, searched to the same target), to tell the encoder apart from the chroma format:

| Image | AVIF (aom, 4:4:4) | aom 4:2:0 | AVIF SVT-AV1 (4:2:0) |
| --- | --- | --- | --- |
| `cid22-friends.png` (photo, people) | **53.0 KB**, 90.0 | 62.9 KB, 89.5 | 72.2 KB, 89.7 |
| `cid22-church.png` (photo, detail) | **66.5 KB**, 89.7 | 87.1 KB, 90.3 | 71.9 KB, 89.7 |
| `cid22-blossoms.png` (photo, color) | **125.0 KB**, 89.7 | 202.9 KB, 78.6 * | 166.7 KB, 78.4 * |
| `forest-leaves.png` (texture) | 805.2 KB, 90.4 | **779.3 KB**, 90.4 | 839.0 KB, 90.5 |
| `corporate-memphis.png` (illustration) | **18.7 KB**, 89.9 | 56.3 KB, 87.8 * | 43.6 KB, 87.7 * |
| `report-ui.png` (UI, text) | **62.6 KB**, 89.9 | 156.4 KB, 78.8 * | 104.2 KB, 78.7 * |
| `pipeline-diagram.png` (diagram) | **61.3 KB**, 90.1 | 57.3 KB, 75.4 * | failed (odd height) |

At matched 4:2:0, SVT-AV1 and aom trade places on the photographs (+15% on the people photograph, −17% on the church), and where 4:2:0 cannot reach the target, on the blossoms photograph, the UI screenshot and the illustration, SVT-AV1 reaches the same quality ceiling with fewer bytes (−18%, −33% and −22%). What holds it back is the chroma format, not the encoder: forcing aom to 4:2:0 costs it as much (+19% and +31% on the people and church photographs, and the blossoms photograph, the illustration, the UI and the diagram no longer reach the target). Encode times at the default speed are similar to aom's here.

**Takeaway.** SVT-AV1 is built for video, where 4:2:0 is the norm; for still images AVIF's 4:4:4 default is worth more than the choice of encoder. Use SVT-AV1 for AVIF stills only where 4:2:0 is acceptable, which is a property of the image rather than of photographs as a category: the blossoms photograph, saturated red over a smooth sky, cannot reach the target in 4:2:0 with either encoder. Expect it to reject odd-sized images too.

**Using it.** `avifenc -c svt -y 420`; with odd dimensions, crop or pad to even first.

**References.** [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) (Jake Archibald, 2026: "AVIF's 4:2:0 mode (half colour resolution) shouldn't be your default", since it rarely reduces size and makes higher qualities harder to reach); [SVT-AV1](https://gitlab.com/AOMediaCodec/SVT-AV1) and its [`Parameters.md`](https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md) (`--color-format`: "only yuv420 is supported at this time"); [`avifenc` manual](https://github.com/AOMediaCodec/libavif/blob/main/doc/avifenc.1.md) (`-y`, and `-c` per build).

### libjpeg-turbo (`jpeg-turbo`)

**What it changes.** [libjpeg-turbo](https://libjpeg-turbo.org/) is the JPEG library most software links against, and the baseline the other two JPEG encoders improve on: [mozjpeg](https://github.com/mozilla/mozjpeg) is "a patch for libjpeg-turbo" that adds trellis quantization, optimized progressive scans and new quantization tables, and [jpegli](https://github.com/google/jpegli) is a libjpeg62-compatible encoder with adaptive quantization and floating-point color conversion. All three write ordinary JPEG. This variant runs libjpeg-turbo's own `cjpeg` with mozjpeg's command line (`-quality`, 1..100). Debian's `cjpeg` 2.1 does not read PNG (PNG input arrived in 3.2), so the reference is handed over as a binary PPM, converted once with `vips` (lossless for 8-bit RGB) and outside the timed encode.

**What it is worth on the demo images** (target ssimulacra2 90, image 0.2.0, each encoder at its defaults):

| Image | libjpeg-turbo | mozjpeg | jpegli |
| --- | --- | --- | --- |
| `cid22-friends.png` (photo, people) | 82.3 KB, 89.6 | 89.4 KB, 90.2 (+9%) | **62.9 KB**, 89.8 (−24%) |
| `cid22-church.png` (photo, detail) | 103.7 KB, 90.3 | 97.0 KB, 89.9 (−7%) | **76.4 KB**, 89.7 (−26%) |
| `cid22-blossoms.png` (photo, color) | 219.0 KB, 78.7 * | 160.4 KB, 90.2 | **133.8 KB**, 90.1 |
| `forest-leaves.png` (texture) | 919.6 KB, 90.3 | 1093.7 KB, 89.6 (+19%) | **724.5 KB**, 89.9 (−21%) |
| `corporate-memphis.png` (illustration) | 127.8 KB, 88.1 * | 97.8 KB, 89.6 | **78.5 KB**, 89.9 |
| `report-ui.png` (UI, text) | 302.8 KB, 78.8 * | 213.3 KB, 90.2 | **165.5 KB**, 89.9 |
| `pipeline-diagram.png` (diagram) | 177.5 KB, 75.7 * | 176.5 KB, 89.9 | **111.0 KB**, 89.3 * |

jpegli is the smallest on every image, 21–45% below libjpeg-turbo. libjpeg-turbo cannot reach the target on the three graphics images and the blossoms photograph, even at its highest settings (`-quality 99`–`100`). And mozjpeg, the "improved" encoder, is *larger* than plain libjpeg-turbo on the people photograph (+9%) and the texture (+19%).

**Why mozjpeg loses on photographs: not its subsampling default.** libjpeg-turbo always subsamples color 4:2:0 by default. mozjpeg chooses by quality: 4:4:4 at `-quality` 90 and above, 4:2:2 (`2x1`) from 80, because "for some images chroma subsampling significantly degrades color quality, making it impossible to achieve high visual quality regardless of quality setting" ([`rdswitch.c`](https://github.com/mozilla/mozjpeg/blob/master/rdswitch.c)). Reaching ssimulacra2 90 takes `-quality` 94–99, so mozjpeg encodes 4:4:4. That choice is not what costs it bytes: libjpeg-turbo forced to 4:4:4 (`-sample 1x1`) is *smaller* than its own 4:2:0 default on the three images where both reach the target (−7% to −17%: the texture and the people and church photographs) and reaches the target on the other four, so at this quality full-resolution color pays for itself on every image here, photographs included. Searched to the same target with the subsampling forced equal, the difference is in the encoders: at 4:2:0 (`-sample 2x2`) mozjpeg is smaller than libjpeg-turbo on six of the seven images (−1.5% to −24%; +7% on the people photograph), but at 4:4:4 it is smaller only on the illustration and the diagram, and 5–28% larger on the photographs, the texture and the UI screenshot. mozjpeg's encoder improvements hold at 4:2:0; at 4:4:4 and these high settings, where its default lands, they do not.

**Takeaway.** For JPEG at high quality, compare encoders at matched settings before drawing conclusions: the subsampling and how each encoder spends bits at that subsampling both move the result, and whether 4:2:0 is enough depends on the image's color detail, not on whether it is a photograph. jpegli wins at its defaults across all content here, and stays fast (10–90 ms per encode, libjpeg-turbo under 10 ms, against 100 ms–1.1 s for mozjpeg).

**Using it.** `cjpeg -quality N` (add `-sample 1x1` for 4:4:4); libjpeg-turbo 3.2 reads PNG directly, earlier releases need PPM, BMP, GIF or Targa.

**References.** [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) (on 4:2:0 as a default, for AVIF; the JPEG measurements here point the same way); [libjpeg-turbo](https://libjpeg-turbo.org/) and its [`usage.txt`](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/doc/usage.txt) (default subsampling 2x2, "4:2:0"); [mozjpeg](https://github.com/mozilla/mozjpeg) ("a strict superset of libjpeg-turbo's functionality") and its quality-dependent subsampling in [`rdswitch.c`](https://github.com/mozilla/mozjpeg/blob/master/rdswitch.c); [jpegli](https://github.com/google/jpegli) (adaptive dead-zone quantization).

## Size-regression gate

CI fails if a codec's **bytes at equal quality** grow beyond a tolerance (2%) versus
a committed baseline (`demos/baseline.json`), so a change that quietly makes a codec's
output larger is caught. The baseline also records each codec's achieved ssimulacra2
score, and a drop of more than 0.5 points fails too, so a file cannot pass as smaller
by settling at a lower quality. A codec that failed on an image counts as missing, which fails the check too. Both are deterministic given the pinned codec versions
in the image; timing is never gated.

The check also fails, without comparing anything, when the run's target differs from
the one the baseline was generated at. The workflow defines the target once and passes
it to both the comparison and the check.

The check runs on pull requests that can change codec output (the `Dockerfile`, the
comparison sources, the demo images, or the baseline), and on `main`. On a pull request it also uploads
the HTML report and posts a sticky comment linking it (a download; open `report.html`
locally), with the date the artifact expires.

When a change moves sizes or scores on purpose (a codec version bump, a knob change),
regenerate the baseline and commit it. Generate it from the CI run's `results.csv`
(in the pull request's report artifact) rather than a local run: CI runs on amd64,
and sizes differ slightly between architectures.

```bash
node bin/check-regression.js demos/baseline.json results.csv --update --target 90
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
- The search target metric is ssimulacra2; dssim is reported alongside for reference but does not drive the search. ssimulacra2 comes from Cloudinary (Jon Sneyers, also a JPEG XL author), "a perceptual image quality metric by the folks behind JPEG XL", as [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) puts it; it was tuned and validated on independent subjective scores (CID22, TID2013, KADID-10k, KonFiG-IQA), but a metric with no tie to any codec, such as [ColorVideoVDP](https://github.com/gfxdisp/ColorVideoVDP), is a useful cross-check where JPEG XL and another format are close.
- Codec versions affect the operating point. Use the Docker image for reproducible
  numbers; a native install will differ with its tool versions.
