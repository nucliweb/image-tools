# image-tools — reproducible image codec + quality toolbox
#
# STATUS: DRAFT — not yet built/verified (Docker daemon was down when authored).
# Build & verify with:  docker build -t image-tools .
# The source-build stages (libjxl, jpegli, ect, flip, butteraugli) are the
# likely iteration points; apt/cargo stages are low risk.
#
# Goal: one environment where every encoder/decoder and every quality metric
# lives together, so codec comparisons are apples-to-apples.

FROM debian:bookworm-slim AS builder

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
ARG JPEGLI_REF=main
RUN git clone --depth 1 --branch ${JPEGLI_REF} https://github.com/google/jpegli.git \
    && cd jpegli \
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
ARG FLIP_REF=main
RUN git clone --depth 1 --branch ${FLIP_REF} https://github.com/NVlabs/flip.git flip \
    && cmake -S flip/src -B flip/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build flip/build \
    && install -Dm755 flip/build/flip -t /out/bin/

# --- butteraugli: standalone (redundant with ssimulacra2, included on request)-
ARG BUTTERAUGLI_REF=master
RUN git clone --depth 1 --branch ${BUTTERAUGLI_REF} \
      https://github.com/google/butteraugli.git \
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
# Debian's rustc (1.63) is too old for current dssim/oxipng (need rustc >=1.71 and
# the 2024 edition), so install a modern stable toolchain via rustup.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --profile minimal \
    && . "$HOME/.cargo/env" \
    && cargo install dssim oxipng --root /out


# =============================================================================
FROM debian:bookworm-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive

# Bulk of the toolbox straight from apt (encoders, generalists, optimizers).
RUN apt-get update && apt-get install -y --no-install-recommends \
      webp libavif-bin libjpeg-turbo-progs libheif-examples \
      imagemagick libvips-tools ffmpeg libimage-exiftool-perl \
      pngquant optipng zopfli advancecomp pngcrush gifsicle jpegoptim guetzli \
      openimageio-tools nodejs \
      libbrotli1 libhwy1 libpng16-16 libjpeg62-turbo libgif7 liblcms2-2 \
    && rm -rf /var/lib/apt/lists/*

# Source-built + rust tools from the builder stage.
COPY --from=builder /out/bin/ /usr/local/bin/

# Comparison tool (Node.js CLI, zero npm dependencies).
COPY compare/ /opt/image-tools/compare/
RUN ln -s /opt/image-tools/compare/bin/compare.js /usr/local/bin/compare-codecs

WORKDIR /work
ENTRYPOINT ["/bin/bash"]
