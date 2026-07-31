#!/usr/bin/env bash
# Download the sample images used by the comparison demo.
#
# These are from the Kodak Lossless True Color Image Suite, a public set widely
# used for image-codec evaluation. They are not committed to keep the repo light.
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)/images"
mkdir -p "$dir"

base="https://r0k.us/graphics/kodak/kodak"
for n in 04 19 23; do
  out="$dir/kodim${n}.png"
  if [ -s "$out" ]; then
    echo "have kodim${n}.png"
  else
    echo "fetching kodim${n}.png"
    curl -fsSL --max-time 60 "${base}/kodim${n}.png" -o "$out"
  fi
done

echo "Done. Now: compare-codecs $dir --target 90 --html report.html"
