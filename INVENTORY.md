# Image tooling inventory

Command-line encoders, decoders, generalist tools, and quality-validation tools
available on this system (macOS, Apple Silicon, Homebrew under `/opt/homebrew`).

Legend: **✅ on PATH** · **🔸 installed but off PATH (keg-only or custom prefix)** · **❌ not installed**

## Encoders / decoders

| Format | Tool | Version | Status | Path / notes |
| --- | --- | --- | --- | --- |
| WebP | `cwebp` / `dwebp` | 1.6.0 | ✅ | + `gif2webp`, `img2webp`, `webpmux` |
| AVIF | `avifenc` / `avifdec` | 1.4.2 | ✅ | aom 3.14.1 (enc), dav1d 1.5.3 (dec) |
| JPEG XL | `cjxl` / `djxl` / `jxlinfo` | 0.12.0 | ✅ | via `jpeg-xl` |
| JPEG (jpegli) | `cjpegli` / `djpegli` | 0.12 (`google/jpegli` @031a007) | ✅ | self-contained prefix `~/.local/opt/jpegli`, symlinked into PATH; relocatable (`@loader_path/../lib` rpath) |
| JPEG (turbo) | `cjpeg` / `djpeg` / `jpegtran` | 3.2.0 | ✅ | **the `cjpeg` on PATH is jpeg-turbo (fast baseline), not mozjpeg** |
| JPEG (mozjpeg) | `cjpeg` | 4.1.5 | 🔸 | keg-only: `/opt/homebrew/opt/mozjpeg/bin/cjpeg` — trellis-optimized, must be called by full path |
| HEIF/HEIC | `heif-enc` / `heif-dec` / `heif-convert` | 1.23.1 | ✅ | via `libheif` (+ libde265) |

## Generalist (convert / resize / inspect)

| Tool | Version | Status | Notes |
| --- | --- | --- | --- |
| ImageMagick 7 | 7.1.2-27 | ✅ | `magick`, `identify`, `convert`, `mogrify`, `compare` |
| libvips | 8.18.4 | ✅ | `vips`, `vipsthumbnail` — fastest/low-memory for batch |
| ffmpeg / ffprobe | 8.1.2 | ✅ | frames, GIF, still-image analysis |
| exiftool | 13.55 | ✅ | EXIF / ICC / XMP metadata |
| sips | (system) | ✅ | `/usr/bin/sips` — quick pixel dimensions |

## Quality / perceptual comparison

| Tool | Version | Status | Metric |
| --- | --- | --- | --- |
| ssimulacra2 | (brew) | ✅ | modern perceptual score for codec comparison (higher = closer; ~90+ excellent) |
| dssim | 3.4.0 | ✅ | structural SSIM (lower = closer to original) |
| `magick compare` | 7.1.2 | ✅ | PSNR, RMSE, MAE, etc. via `-metric` |
| benchmark_xl | (jpeg-xl) | ✅ | libjxl codec benchmark harness with quality metrics |
| perceptualdiff | (brew) | ✅ | perceptual image diff (pass/fail + differing pixel count) |
| idiff | (openimageio) | ✅ | OpenImageIO diff (mean/RMS/PSNR); pulls a heavy dep tree |
| butteraugli (standalone) | — | 🔸 Docker | redundant with ssimulacra2; provided in the Docker image only |
| flip | — | 🔸 Docker | NVIDIA FLIP perceptual diff; provided in the Docker image only |

## Lossless optimizers

| Tool | Version | Status | Purpose |
| --- | --- | --- | --- |
| oxipng | (brew) | ✅ | PNG recompression (fast, multithreaded) |
| pngquant | (brew) | ✅ | lossy PNG palette quantization |
| optipng | (brew) | ✅ | PNG recompression |
| zopflipng | (`zopfli`) | ✅ | slow, high-ratio PNG recompression |
| advpng | (`advancecomp`) | ✅ | PNG recompression (deflate/zopfli) |
| pngcrush | (brew) | ✅ | PNG recompression |
| gifsicle | (brew) | ✅ | GIF optimization |
| jpegoptim | (brew) | ✅ | JPEG lossless/lossy optimization |
| guetzli | (brew) | ✅ | perceptual JPEG optimizer (superseded by jpegli) |
| ect | — | 🔸 Docker | Efficient-Compression-Tool; not in brew, provided in Docker |

## Notes for this project

- **Perceptual distance as a common currency.** `cjpegli -d N`, `cjxl -d N`, and `avifenc` all
  speak butteraugli distance. Comparing formats at equal target distance is more meaningful than
  comparing their different `-q` scales.
- **Two JPEG encoders coexist.** `cjpeg` on PATH = jpeg-turbo (baseline). For quality-optimized
  JPEG use jpegli (`cjpegli`) or mozjpeg via its keg-only path.
- **jpegli is self-contained.** Lives at `~/.local/opt/jpegli` (bin + dylibs); depends only on the
  Homebrew libs `highway`, `jpeg-turbo`, `libpng`, `giflib`.

## Homebrew image formulae installed

`aom`, `brotli`, `dav1d`, `dssim`, `exiftool`, `ffmpeg`, `highway`, `imagemagick`, `jpeg-turbo`,
`jpeg-xl`, `libavif`, `libde265`, `libheif`, `libpng`, `mozjpeg`, `openjpeg`, `ssimulacra2`, `vips`, `webp`
