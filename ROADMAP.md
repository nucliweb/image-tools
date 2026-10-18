# Roadmap

This is a lightweight list of ideas under consideration. Nothing here is committed to a release or a date; items graduate to issues or pull requests when they are picked up. The product, the reproducible toolbox and the `compare-codecs` harness, comes first, so priority favours depth in the comparison tool over breadth of scope.

## Status

The current state is stable: `compare-codecs` supports six codecs (JPEG XL, AVIF, WebP, jpegli, mozjpeg, HEIC) with equal-quality search, batch mode, CSV output, per-codec encode timing, matched encoder effort (`--effort`), a rate-distortion mode (`--rd`) with BD-rate against mozjpeg, and a self-contained interactive HTML report with a difference view and a rate–distortion chart that, with `--rd`, plots the equal-quality curves and BD-rates. All three test layers (unit, gated integration, and the image E2E build) run in CI, alongside a size-regression gate against a committed baseline that comments on pull requests, and a weekly comparison report on the demo images, a set of seven covering photographs, a flat illustration, a high-detail texture, a UI screenshot and a diagram. The comparison and the regression gate are also packaged as a GitHub Action, [Compare image codecs](https://github.com/nucliweb/compare-codecs-action), for use on other repositories' images.

## Ideas

### Features

- **Rate-distortion curves by default in the HTML report.** Without `--rd`, the report's chart is still a coarse fixed-knob sweep. Making the equal-quality curves the default would drop the sweep, at the cost of one search per target instead of five fixed encodes per codec.
- **More codecs.** Extend beyond the current six as encoders mature or new ones become relevant. Low effort per codec, since the equal-quality search already generalises across quality knobs.

### Documentation

- **Public learnings document.** A public, English write-up of the technical gotchas found while building the toolbox (static linking, version-specific encoder flags, PNG chunk handling for the metrics, and similar). Decide whether to publish it and in what form.

### Testing

No test debt is outstanding; the three layers cover the current surface. New coverage follows new behaviour: adding codecs brings its own tests.

## Contributing an idea

Open an issue to discuss an item before it becomes a pull request. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the commit convention and workflow.
