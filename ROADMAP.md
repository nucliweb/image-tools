# Roadmap

This is a lightweight list of ideas under consideration. Nothing here is committed to a release or a date; items graduate to issues or pull requests when they are picked up. The product, the reproducible toolbox and the `compare-codecs` harness, comes first, so priority favours depth in the comparison tool over breadth of scope.

## Status

The current state is stable: `compare-codecs` supports six codecs (JPEG XL, AVIF, WebP, jpegli, mozjpeg, HEIC) with equal-quality search, batch mode, CSV output, per-codec encode timing, matched encoder effort (`--effort`), a rate-distortion mode (`--rd`) with BD-rate against mozjpeg, and a self-contained interactive HTML report with a difference view and a rate–distortion chart that, with `--rd`, plots the equal-quality curves and BD-rates. All three test layers (unit, gated integration, and the image E2E build) run in CI, alongside a size-regression gate against a committed baseline that comments on pull requests, and a weekly comparison report on the demo images, a set of seven covering photographs, a flat illustration, a high-detail texture, a UI screenshot and a diagram. The comparison and the regression gate are also packaged as a GitHub Action, [Compare image codecs](https://github.com/nucliweb/compare-codecs-action), for use on other repositories' images.

## Ideas

### Features

- **Rate-distortion curves by default in the HTML report.** Without `--rd`, the report's chart is still a coarse fixed-knob sweep. Making the equal-quality curves the default would drop the sweep, at the cost of one search per target instead of five fixed encodes per codec.
- **More codecs.** Extend beyond the current six as encoders mature or new ones become relevant. Low effort per codec, since the equal-quality search already generalises across quality knobs. A candidate is [jixel](https://github.com/awxkee/jixel), a second JPEG XL encoder (Rust, BSD-3-Clause, ported from libjxl-tiny) that [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) finds much closer to AVIF than libjxl on photographs; as an opt-in variant it would repeat the rav1e and SVT-AV1 lesson for JPEG XL. It has no CLI, so the image would build a small wrapper.
- **Encode memory.** Record each encoder's peak resident memory next to its time. Every encode already runs under `/usr/bin/time`, which reports it with `-v` (GNU) or `-l` (BSD/macOS), so it is a column in the table and the CSV rather than new machinery.
- **Tool versions in the results.** Write the encoder, decoder and metric versions into the CSV and the HTML report, so a result read outside the Docker image still says which builds produced it.
- **An independent second metric.** Optionally score every result with [ColorVideoVDP](https://github.com/gfxdisp/ColorVideoVDP), from a lab with no tie to any codec, as a cross-check on ssimulacra2 where JPEG XL and another format are close. It is a Python and PyTorch install of about 1 GB, so it would stay outside the default image.
- **Decode with platform decoders.** Measure what users actually see: decode with the platform's own decoder (Apple ImageIO through `sips`, browsers) as well as the reference decoders, and time the decode. The HEIC 4:2:0 lesson already shows a 1.5–8.4 point gap between libheif and ImageIO, and decode speed is part of the trade-off ([JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) measures it in Firefox, Chrome and Safari).

### Demo material

- **An image with alpha.** The seven demo images are all opaque RGB. Transparency changes the comparison (some encoders store alpha losslessly, which [JPEG XL vs AVIF for web use-cases](https://jakearchibald.com/2026/jpeg-xl-vs-avif/) shows costing jixel 136% against AVIF), so the set should include one image with an alpha channel.

### Documentation

- **Public learnings document.** A public, English write-up of the technical gotchas found while building the toolbox (static linking, version-specific encoder flags, PNG chunk handling for the metrics, and similar). Decide whether to publish it and in what form.

### Testing

No test debt is outstanding; the three layers cover the current surface. New coverage follows new behaviour: adding codecs brings its own tests.

## Contributing an idea

Open an issue to discuss an item before it becomes a pull request. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the commit convention and workflow.
