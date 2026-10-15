# Comparison demo

A ready-to-run example of the codec comparison tool and its interactive report.

## Run it

```bash
./fetch.sh                                                  # assemble the sample images
compare-codecs images --target 90 --html report.html        # or: node ../bin/compare.js
open report.html
```

## Sample images

The set covers the kinds of content where codecs behave differently, so the report shows how the winner changes with the subject, not only with the quality target. `fetch.sh` assembles it in `images/`: it downloads the third-party images from fixed URLs and checks each against a SHA-256, and copies the project's own images from `own/`. The checksums keep the set, and the regression baseline built on it, from drifting if a source changes a file.

| Image | Content | Size | Source | License |
| --- | --- | --- | --- | --- |
| `kodim04.png`, `kodim19.png`, `kodim23.png` | Photographs | 768×512 | [Kodak Lossless True Color Image Suite](https://r0k.us/graphics/kodak/) | Released by Kodak for unrestricted use |
| `corporate-memphis.png` | Flat illustration | 1200×750 | [Corporate Memphis (2019)](https://commons.wikimedia.org/wiki/File:Corporate_Memphis_(2019).png) by Katharina Brenner, Wikimedia Commons | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `forest-leaves.png` | High-detail texture | 1024×1024 | [Forest Leaves 02](https://polyhaven.com/a/forest_leaves_02), Poly Haven (diffuse map, 1k) | [CC0](https://polyhaven.com/license) |
| `report-ui.png` | UI screenshot with small text | 1200×800 | This project: a screenshot of `example-report.html` | MIT, as the repository |
| `pipeline-diagram.png` | Diagram with thin lines and text | 1200×675 | This project: `own/pipeline-diagram.svg` | MIT, as the repository |

Every image is an 8-bit RGB PNG with no alpha channel, and each third-party original is lossless, so no codec is measured against artifacts a previous lossy encode left behind.

The two own images are committed in `own/` (losslessly optimized with oxipng). Both were rendered with headless Chrome at a device scale factor of 1:

```bash
chrome --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,800 \
  --screenshot=report-ui.png example-report.html
chrome --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,675 \
  --screenshot=pipeline-diagram.png own/pipeline-diagram.svg
```

Changing, adding or removing an image changes the regression gate's results, so regenerate `baseline.json` from the CI run's `results.csv` afterwards (see "Size-regression gate" in `../README.md`).

## Example output

`example-report.html` is a small pre-generated report (a single, downscaled image) so you can see the interactive report without running anything. The full report, produced by the command above over all the sample images, is larger because it embeds every codec's decoded preview.
