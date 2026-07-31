# Comparison demo

A ready-to-run example of the codec comparison tool and its interactive report.

## Run it

```bash
./fetch.sh                                                  # download sample images
compare-codecs images --target 90 --html report.html        # or: node ../bin/compare.js
open report.html
```

The sample images are the Kodak Lossless True Color Image Suite (a public set
commonly used for image-codec evaluation). They are downloaded by `fetch.sh` and
not committed to the repository.

## Example output

`example-report.html` is a small pre-generated report (a single, downscaled image)
so you can see the interactive report without running anything. The full report,
produced by the command above over the three sample images, is larger because it
embeds every codec's decoded preview.
