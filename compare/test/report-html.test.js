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
            encodeWallMs: 120,
            encodeCpuMs: 350,
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
  assert.match(html, /"encMs":120/, "carries encode wall time"); // stats panel timing
  assert.match(html, /"cpuMs":350/, "carries encode cpu time");
  assert.ok(html.includes('id="data"'), "carries the data blob");
  assert.ok(html.includes('id="takeaway"'), "has the plain-language takeaway");
  assert.ok(html.includes('id="aggregate"'), "has the cross-image aggregate section");
  assert.ok(html.includes('class="zoom"'), "has the zoom control");
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

test("an RD report carries the targets, each codec's BD-rate and the batch mean", () => {
  const rd = structuredClone(report);
  rd.rd = {
    targets: [70, 92],
    baselineId: "jxl",
    baselineName: "JPEG XL",
    aggregate: [{ id: "jxl", name: "JPEG XL", meanBdRate: 0, rated: 1, count: 1 }],
  };
  rd.images[0].codecs[0].bdRate = 0;
  const data = JSON.parse(buildHtml(rd).match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(data.rd.targets, [70, 92]);
  assert.equal(data.rd.baselineId, "jxl");
  assert.equal(data.rd.aggregate[0].meanBdRate, 0);
  assert.equal(data.images[0].codecs[0].bd, 0);
});

test("a report without RD data has no BD-rates", () => {
  const data = JSON.parse(buildHtml(report).match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(data.rd, null);
  assert.equal(data.images[0].codecs[0].bd, null);
});

test("RD points keep their target so the page reads the measured encode there", () => {
  const rd = structuredClone(report);
  rd.rd = { targets: [70, 90], baselineId: "jxl", baselineName: "JPEG XL", aggregate: [] };
  rd.images[0].codecs[0].points = [
    { target: 70, ssimulacra2: 70.3, bpp: 0.5, bytes: 100, label: "-d 5" },
    { target: 90, ssimulacra2: 89.6, bpp: 1.2, bytes: 240, label: "-d 1" },
  ];
  const data = JSON.parse(buildHtml(rd).match(/<script id="data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(data.images[0].codecs[0].points.map((p) => p.t), [70, 90]);
});
