# Roadmap

This is a lightweight list of ideas under consideration. Nothing here is committed to a release or a date; items graduate to issues or pull requests when they are picked up. The product, the reproducible toolbox and the `compare-codecs` harness, comes first, so priority favours depth in the comparison tool over breadth of scope.

## Status

The current state is stable: `compare-codecs` supports six codecs (JPEG XL, AVIF, WebP, jpegli, mozjpeg, HEIC) with equal-quality search, batch mode, CSV output, and a self-contained interactive HTML report. All three test layers (unit, gated integration, and the image E2E build) run in CI.

## Ideas

### Features

- **Rate-distortion analysis mode.** A dedicated rate-distortion output, curves of size versus quality across a range of targets, beyond the single chart embedded in the HTML report. This is the highest-value idea: it turns the tool from a point comparison at one quality into a full RD picture per codec.
- **More codecs.** Extend beyond the current six as encoders mature or new ones become relevant. Low effort per codec, since the equal-quality search already generalises across quality knobs.
- **More demo material.** Broaden the sample set (currently three Kodak images) with more images and content types, so the demo report shows how codec winners change with the subject.

### Documentation

- **Public learnings document.** A public, English write-up of the technical gotchas found while building the toolbox (static linking, version-specific encoder flags, PNG chunk handling for the metrics, and similar). Decide whether to publish it and in what form.

### Testing

No test debt is outstanding; the three layers cover the current surface. New coverage follows new behaviour: adding codecs or the rate-distortion mode brings its own tests.

## Contributing an idea

Open an issue to discuss an item before it becomes a pull request. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the commit convention and workflow.
