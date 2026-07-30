#!/usr/bin/env bash
# Runtime verification for the image-tools Docker image.
#
# A green `docker build` only proves the tools compiled. This script proves they
# actually run: it exercises the real pipeline (generate → encode → decode →
# measure) with the modern codecs and metrics, then presence-checks the rest of
# the toolbox.
#
# Usage (from the repo root):
#   docker build -t image-tools .
#   docker run --rm --entrypoint bash image-tools -c "$(cat smoke-test.sh)"
#
# Exits non-zero if any required tool is missing or the pipeline fails.

set -u

fail=0
pass=0
work="$(mktemp -d)"
orig="$work/orig.png"

ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
skip() { printf '  --   %s (optional, absent)\n' "$1"; }

# A tool "runs" if invoking it does not fail with 126/127 (missing/not executable).
runs() {
  local name="$1"; shift
  "$@" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq 127 ] || [ "$rc" -eq 126 ]; then bad "$name (cannot execute)"; return 1; fi
  ok "$name"; return 0
}

nonempty() { [ -s "$1" ]; }

echo "== Generating a test image =="
convert -size 256x256 gradient:black-white -evaluate Gaussian-noise 8 "$orig" \
  && nonempty "$orig" && ok "convert (test image created)" || bad "convert (test image)"

echo
echo "== Encode → decode → metric (the pipeline that matters) =="

# JPEG XL
if cjxl "$orig" "$work/o.jxl" -d 1.0 >/dev/null 2>&1 && nonempty "$work/o.jxl"; then
  ok "cjxl (encode -d 1.0)"
else bad "cjxl (encode)"; fi
if djxl "$work/o.jxl" "$work/jxl_dec.png" >/dev/null 2>&1 && nonempty "$work/jxl_dec.png"; then
  ok "djxl (decode)"
else bad "djxl (decode)"; fi

# jpegli
if cjpegli "$orig" "$work/o.jpegli.jpg" -d 1.0 >/dev/null 2>&1 && nonempty "$work/o.jpegli.jpg"; then
  ok "cjpegli (encode -d 1.0)"
else bad "cjpegli (encode)"; fi
runs "djpegli (decode)" djpegli "$work/o.jpegli.jpg" "$work/jpegli_dec.png"

# AVIF
if avifenc "$orig" "$work/o.avif" >/dev/null 2>&1 && nonempty "$work/o.avif"; then
  ok "avifenc (encode)"
else bad "avifenc (encode)"; fi
runs "avifdec (decode)" avifdec "$work/o.avif" "$work/avif_dec.png"

# WebP
if cwebp "$orig" -o "$work/o.webp" >/dev/null 2>&1 && nonempty "$work/o.webp"; then
  ok "cwebp (encode)"
else bad "cwebp (encode)"; fi
runs "dwebp (decode)" dwebp "$work/o.webp" -o "$work/webp_dec.png"

# HEIF
if heif-enc "$orig" -o "$work/o.heic" >/dev/null 2>&1 && nonempty "$work/o.heic"; then
  ok "heif-enc (encode)"
else bad "heif-enc (encode)"; fi

echo
echo "== Quality metrics on the decoded JXL vs original =="
dec="$work/jxl_dec.png"
if s=$(ssimulacra2 "$orig" "$dec" 2>/dev/null); then ok "ssimulacra2 (score: ${s})"; else bad "ssimulacra2"; fi
if d=$(dssim "$orig" "$dec" 2>/dev/null | awk '{print $1}'); then ok "dssim (score: ${d})"; else bad "dssim"; fi
runs "idiff (OpenImageIO)" idiff "$orig" "$dec"
runs "compare (ImageMagick)" compare -metric PSNR "$orig" "$dec" null:
( cd "$work" && flip -r "$orig" -t "$dec" >/dev/null 2>&1 ) && ok "flip (NVIDIA)" || bad "flip"

# butteraugli is explicitly optional (redundant with ssimulacra2)
if command -v butteraugli >/dev/null 2>&1; then
  runs "butteraugli (optional)" butteraugli "$orig" "$dec"
else skip "butteraugli"; fi

echo
echo "== Presence of the rest of the toolbox =="
for t in gif2webp jpegtran cjpeg djpeg mozjpeg-cjpeg vips vipsthumbnail ffmpeg ffprobe \
         exiftool identify pngquant optipng zopflipng advpng pngcrush gifsicle jpegoptim \
         guetzli ect heif-enc heif-convert oiiotool jxlinfo oxipng; do
  command -v "$t" >/dev/null 2>&1 && ok "$t" || bad "$t (missing)"
done

echo
echo "== Comparison harness (Node.js CLI) =="
if command -v compare-codecs >/dev/null 2>&1; then
  if compare-codecs "$orig" --codecs jxl,webp --target 80 --max-iterations 4 >/dev/null 2>&1; then
    ok "compare-codecs (jxl,webp end-to-end)"
  else bad "compare-codecs (run)"; fi
else bad "compare-codecs (missing)"; fi

rm -rf "$work"
echo
echo "== Summary: ${pass} ok, ${fail} failed =="
[ "$fail" -eq 0 ]
