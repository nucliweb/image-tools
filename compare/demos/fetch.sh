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

# The photographs come from the CID22 validation set, published as one zip: it is
# downloaded once, checked, and only the chosen references are extracted.
cid22_url="https://cloudinary-marketing-res.cloudinary.com/raw/upload/v1682006008/CID22_validation_set_without_distorted.zip"
cid22_sha="daa95777dc8f2abd086449c1eb1e6636ce178bfc5f7346f4bfdb806375319f63"
# name, path inside the zip, sha256
cid22=(
  "cid22-friends.png CID22_validation_set/original/5055743.png a86da9a4a647648f74497bd3e0ca5987020b9d9abcde558e9a5f649b9b8bc0e8"
  "cid22-church.png CID22_validation_set/original/2936831.png be4bfd85b5c7bcfca45090271b3750ec548b2c6f9bee0883c2374d1592d7e667"
  "cid22-blossoms.png CID22_validation_set/original/5458393.png 1225af495f25c0f07d9c3479c8b9c029bf1ac9f463e498d81790ffac6764a746"
)

# name, url, sha256
sources=(
  "corporate-memphis.png https://upload.wikimedia.org/wikipedia/commons/0/04/Corporate_Memphis_%282019%29.png 72c3eb1cc07649692bf3ca9c636f32cf29b15c9453fc09f03f351bed350d602d"
  "forest-leaves.png https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/forest_leaves_02/forest_leaves_02_diffuse_1k.png 09903abd88ae5a12932b79f03b0da15f7a952e9b43a4ad041eac31a3b925736d"
)

check() {
  local name="$1" file="$2" expected="$3" actual
  actual="$(sha256 "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $name: expected $expected, got $actual" >&2
    rm -f "$file"
    exit 1
  fi
}

have() { [ -s "$1" ] && [ "$(sha256 "$1")" = "$2" ]; }

missing=0
for entry in "${cid22[@]}"; do
  read -r name _ expected <<< "$entry"
  if have "$dir/$name" "$expected"; then echo "have $name"; else missing=1; fi
done
if [ "$missing" = 1 ]; then
  zip="$(mktemp)"
  trap 'rm -f "$zip"' EXIT
  echo "fetching CID22 validation set (17 MB)"
  curl -fsSL --max-time 120 "$cid22_url" -o "$zip"
  check "CID22 zip" "$zip" "$cid22_sha"
  for entry in "${cid22[@]}"; do
    read -r name path expected <<< "$entry"
    have "$dir/$name" "$expected" && continue
    unzip -p "$zip" "$path" > "$dir/$name"
    check "$name" "$dir/$name" "$expected"
    echo "extracted $name"
  done
fi

for entry in "${sources[@]}"; do
  read -r name url expected <<< "$entry"
  out="$dir/$name"
  if have "$out" "$expected"; then
    echo "have $name"
    continue
  fi
  echo "fetching $name"
  # Wikimedia asks for a descriptive User-Agent.
  curl -fsSL --max-time 60 -A "image-tools demo fetch (https://github.com/nucliweb/image-tools)" "$url" -o "$out"
  check "$name" "$out" "$expected"
done

for own in "$here"/own/*.png; do
  cp "$own" "$dir/"
  echo "copied $(basename "$own")"
done

echo "Done. Now: compare-codecs $dir --target 90 --html report.html"
