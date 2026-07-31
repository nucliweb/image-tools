import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestPoint } from "../src/sweep.js";
import { buildHtml } from "../src/report-html.js";

test("nearestPoint returns the point closest to the target score", () => {
  const points = [{ ssimulacra2: 70 }, { ssimulacra2: 85 }, { ssimulacra2: 93 }];
  assert.equal(nearestPoint(points, 90).ssimulacra2, 93);
  assert.equal(nearestPoint(points, 80).ssimulacra2, 85);
  assert.equal(nearestPoint(points, 60).ssimulacra2, 70);
});

const report = {
  target: 90,
  images: [
    {
      name: "a.png",
      width: 2,
      height: 2,
      originalDataUri: "data:image/png;base64,AAAA",
      codecs: [
        {
          id: "jxl",
          name: "JPEG XL",
          points: [
            { ssimulacra2: 70, bpp: 0.5, bytes: 100, label: "-d 5" },
            { ssimulacra2: 92, bpp: 1.2, bytes: 240, label: "-d 1" },
          ],
          preview: {
            ssimulacra2: 92,
            bpp: 1.2,
            bytes: 240,
            dssim: 0.001,
            label: "-d 1",
            dataUri: "data:image/png;base64,BBBB",
          },
        },
      ],
    },
  ],
};

test("buildHtml produces a self-contained document with embedded data", () => {
  const html = buildHtml(report);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Codec comparison/);
  assert.match(html, /JPEG XL/);
  assert.match(html, /data:image\/png;base64,BBBB/); // preview embedded
  assert.ok(html.includes('id="data"'), "carries the data blob");
  // Self-contained: nothing the browser would fetch. Anchor links are allowed.
  assert.ok(!/\bsrc=["']https?:/i.test(html), "no external script/image src");
  assert.ok(!/<link\b/i.test(html), "no external stylesheet <link>");
  assert.ok(!/@import|url\(https?:/i.test(html), "no external CSS resources");
});

test("buildHtml escapes < in embedded JSON to avoid breaking out of the script", () => {
  const evil = structuredClone(report);
  evil.images[0].codecs[0].name = "X</script>";
  const html = buildHtml(evil);
  assert.ok(!html.includes("X</script>"), "raw </script> must not appear from data");
});
