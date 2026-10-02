# image-tools — reproducible image codec + quality toolbox
#
# Build:   docker build -t image-tools .
# Verify:  docker run --rm --entrypoint bash image-tools -c "$(cat smoke-test.sh)"
# The source-build stages (libjxl, jpegli, ect, flip, butteraugli) are the
# likely iteration points; apt/cargo stages are low risk.
#
# Goal: one environment where every encoder/decoder and every quality metric
# lives together, so codec comparisons are apples-to-apples.

FROM debian:trixie-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build git ca-certificates pkg-config curl \
      libbrotli-dev libhwy-dev libpng-dev libjpeg62-turbo-dev libgif-dev zlib1g-dev \
      liblcms2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# --- libjxl: cjxl / djxl / jxlinfo + ssimulacra2 (canonical source) -----------
ARG LIBJXL_REF=v0.12.0
RUN git clone --depth 1 --branch ${LIBJXL_REF} https://github.com/libjxl/libjxl.git \
    && cd libjxl \
    && git submodule update --init --depth 1 \
         third_party/skcms third_party/sjpeg third_party/highway \
    && cmake -B build -G Ninja \
         -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
         -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF \
         -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF \
         -DJPEGXL_ENABLE_PLUGINS=OFF -DJPEGXL_ENABLE_VIEWERS=OFF \
         -DJPEGXL_ENABLE_OPENEXR=OFF \
         -DJPEGXL_ENABLE_DEVTOOLS=ON \
         -DBUILD_SHARED_LIBS=OFF \
         -DJPEGXL_FORCE_SYSTEM_BROTLI=ON \
    && cmake --build build --target cjxl djxl jxlinfo ssimulacra2 \
    && install -Dm755 build/tools/cjxl build/tools/djxl build/tools/jxlinfo \
         build/tools/ssimulacra2 -t /out/bin/

# --- jpegli: cjpegli / djpegli (moved out of libjxl into google/jpegli) -------
# jpegli, flip and butteraugli publish no release tags, so they are pinned to a
# commit. `git clone --branch` only takes a branch or tag, hence init + fetch.
ARG JPEGLI_REF=031a0077f5799a6041004267fc12b956c1f52a20
RUN git init -q jpegli && cd jpegli \
    && git fetch -q --depth 1 https://github.com/google/jpegli.git ${JPEGLI_REF} \
    && git checkout -q FETCH_HEAD \
    && git submodule update --init --depth 1 \
         third_party/skcms third_party/sjpeg third_party/libjpeg-turbo third_party/highway \
    && cmake -B build -G Ninja \
         -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
         -DJPEGLI_ENABLE_TOOLS=ON -DBUILD_SHARED_LIBS=OFF \
         -DJPEGLI_ENABLE_BENCHMARK=OFF -DJPEGLI_ENABLE_MANPAGES=OFF \
         -DJPEGLI_ENABLE_DOXYGEN=OFF -DJPEGLI_ENABLE_JNI=OFF \
         -DJPEGLI_ENABLE_OPENEXR=OFF -DJPEGLI_ENABLE_FUZZERS=OFF \
    && cmake --build build --target cjpegli djpegli \
    && install -Dm755 build/tools/cjpegli build/tools/djpegli -t /out/bin/

# --- ect: Efficient-Compression-Tool (not in apt) ----------------------------
ARG ECT_REF=v0.9.5
RUN git clone --depth 1 --branch ${ECT_REF} --recursive \
      https://github.com/fhanau/Efficient-Compression-Tool.git ect \
    && cmake -S ect/src -B ect/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build ect/build \
    && install -Dm755 ect/build/ect -t /out/bin/

# --- flip: NVIDIA perceptual image diff (CPU build; optional/heavy) -----------
ARG FLIP_REF=b475eb4bf394ab877c42166c9eb0a84a02cc5b14
RUN git init -q flip \
    && git -C flip fetch -q --depth 1 https://github.com/NVlabs/flip.git ${FLIP_REF} \
    && git -C flip checkout -q FETCH_HEAD \
    && cmake -S flip/src -B flip/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build flip/build \
    && install -Dm755 flip/build/flip -t /out/bin/

# --- butteraugli: standalone (redundant with ssimulacra2, included on request)-
ARG BUTTERAUGLI_REF=71b18b636b9c7d1ae0c1d3730b85b3c127eb4511
RUN git init -q butteraugli \
    && git -C butteraugli fetch -q --depth 1 https://github.com/google/butteraugli.git ${BUTTERAUGLI_REF} \
    && git -C butteraugli checkout -q FETCH_HEAD \
    && cd butteraugli/butteraugli \
    && g++ -O3 -std=c++11 -I.. butteraugli.cc butteraugli_main.cc \
         -o /out/bin/butteraugli -lpng -ljpeg \
    || echo "butteraugli build failed (optional) — continuing"

# --- mozjpeg: trellis-optimized JPEG encoder (cjpeg, not in apt) --------------
# Installed as `mozjpeg-cjpeg` so it does not collide with libjpeg-turbo's cjpeg.
ARG MOZJPEG_REF=v4.1.5
RUN git clone --depth 1 --branch ${MOZJPEG_REF} https://github.com/mozilla/mozjpeg.git \
    && cmake -S mozjpeg -B mozjpeg/build \
         -DCMAKE_BUILD_TYPE=Release -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_SIMD=0 \
    && cmake --build mozjpeg/build \
    && install -Dm755 \
         "$(find mozjpeg/build -maxdepth 1 -type f -perm -u+x -name 'cjpeg*' | head -1)" \
         /out/bin/mozjpeg-cjpeg

# --- rust tools: dssim + oxipng ----------------------------------------------
# Debian's packaged rustc trails the minimum versions that current dssim/oxipng
# releases require, so install a pinned toolchain via rustup. --locked builds with
# each crate's own Cargo.lock, so dependency versions are pinned too.
ARG RUST_TOOLCHAIN=1.99.0
ARG DSSIM_VERSION=3.5.1
ARG OXIPNG_VERSION=10.2.1
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --profile minimal --default-toolchain ${RUST_TOOLCHAIN} \
    && . "$HOME/.cargo/env" \
    && cargo install --locked dssim@${DSSIM_VERSION} oxipng@${OXIPNG_VERSION} --root /out


# =============================================================================
FROM debian:trixie-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Bulk of the toolbox straight from apt (encoders, generalists, optimizers).
RUN apt-get update && apt-get install -y --no-install-recommends \
      # libheif loads its HEVC encoder as a plugin, which is only a recommends.
      webp libavif-bin libjpeg-turbo-progs libheif-examples libheif-plugin-x265 \
      imagemagick libvips-tools ffmpeg libimage-exiftool-perl \
      pngquant optipng zopfli advancecomp pngcrush gifsicle jpegoptim guetzli \
      openimageio-tools nodejs time \
      libbrotli1 libhwy1t64 libpng16-16t64 libjpeg62-turbo libgif7 liblcms2-2 \
    && rm -rf /var/lib/apt/lists/*

# Source-built + rust tools from the builder stage.
COPY --from=builder /out/bin/ /usr/local/bin/

# Comparison tool (Node.js CLI, zero npm dependencies).
COPY compare/ /opt/image-tools/compare/
RUN ln -s /opt/image-tools/compare/bin/compare.js /usr/local/bin/compare-codecs

WORKDIR /work
ENTRYPOINT ["/bin/bash"]
