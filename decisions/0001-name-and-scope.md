# 0001 — Name and scope: `image-tools`

- Status: accepted
- Date: 2026-07-24

## Context

The project bundles command-line tooling for working with image codecs. An early
naming instinct was `image-optim-tools` / `image-optimization-tools`, framing it as an
optimization toolkit.

## Decision

Name the project **`image-tools`**, and scope it as a **toolbox _and_ comparison
harness** covering both:

1. Encoders / decoders / optimizers (WebP, AVIF, JPEG XL, jpegli, mozjpeg, HEIF, PNG
   and GIF optimizers, …).
2. **Quality-validation tools** (ssimulacra2, dssim, butteraugli, FLIP, perceptual
   diffs, PSNR/SSIM).

## Consequences

- The name does not oversell "optimization"; quality validation is a first-class part
  of the scope, not an afterthought.
- The comparison harness is a core deliverable: encode a reference image with each
  codec at an equal perceptual target and report size against quality metrics.
- Perceptual distance (butteraugli `-d`) is the common currency across encoders, so
  comparisons are apples-to-apples rather than tied to each codec's own `-q` scale.
