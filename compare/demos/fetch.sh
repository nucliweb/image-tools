#!/usr/bin/env bash
# Assemble the demo image set in images/: the project's own images (committed in
# own/) plus third-party images downloaded from fixed URLs. Every download is
# checked against a SHA-256, so the set (and the regression baseline built on it)
# cannot drift if a source changes a file. See README.md for sources and licenses.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
dir="$here/images"
mkdir -p "$dir"

sha256() {
  if command -v sha256sum > /dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# name, url, sha256
sources=(
  "kodim04.png https://r0k.us/graphics/kodak/kodak/kodim04.png e3b946107c5d3441c022f678d0c3caf1e224d81b1604ba840a4f88e562de61aa"
  "kodim19.png https://r0k.us/graphics/kodak/kodak/kodim19.png b7450b264b1b0a411390d8931b112c27905a992520fc90569dc4b920aa32bbdc"
  "kodim23.png https://r0k.us/graphics/kodak/kodak/kodim23.png e3111a2fd4da24af15d6459ef9eacfe54106b38e27b4a21821b75c3f5d2d5baf"
  "corporate-memphis.png https://upload.wikimedia.org/wikipedia/commons/0/04/Corporate_Memphis_%282019%29.png 72c3eb1cc07649692bf3ca9c636f32cf29b15c9453fc09f03f351bed350d602d"
  "forest-leaves.png https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forest_leaves_02/forest_leaves_02_diffuse_1k.png 09903abd88ae5a12932b79f03b0da15f7a952e9b43a4ad041eac31a3b925736d"
)

for entry in "${sources[@]}"; do
  read -r name url expected <<< "$entry"
  out="$dir/$name"
  if [ -s "$out" ] && [ "$(sha256 "$out")" = "$expected" ]; then
    echo "have $name"
    continue
  fi
  echo "fetching $name"
  # Wikimedia asks for a descriptive User-Agent.
  curl -fsSL --max-time 60 -A "image-tools demo fetch (https://github.com/nucliweb/image-tools)" "$url" -o "$out"
  actual="$(sha256 "$out")"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $name: expected $expected, got $actual" >&2
    rm -f "$out"
    exit 1
  fi
done

for own in "$here"/own/*.png; do
  cp "$own" "$dir/"
  echo "copied $(basename "$own")"
done

echo "Done. Now: compare-codecs $dir --target 90 --html report.html"
