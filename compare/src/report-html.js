// Builds a self-contained, interactive HTML report from comparison + sweep data.
// No external assets: images are embedded as data URIs and all CSS/JS is inline.

const PALETTE = {
  jxl: "#4f46e5",
  avif: "#059669",
  webp: "#0891b2",
  jpegli: "#d97706",
  mozjpeg: "#dc2626",
  heic: "#7c3aed",
};

/** Reduce the rich report (with file paths) to the JSON the page needs. */
function toClientData(report) {
  return {
    target: report.target,
    images: report.images.map((im) => ({
      name: im.name,
      width: im.width,
      height: im.height,
      original: im.originalDataUri,
      codecs: im.codecs.map((c) => ({
        id: c.id,
        name: c.name,
        color: PALETTE[c.id] || "#64748b",
        points: c.points.map((p) => ({
          s: Number(p.ssimulacra2.toFixed(3)),
          bpp: Number(p.bpp.toFixed(4)),
          bytes: p.bytes,
          label: p.label,
        })),
        preview: {
          s: Number(c.preview.ssimulacra2.toFixed(2)),
          bpp: Number(c.preview.bpp.toFixed(4)),
          bytes: c.preview.bytes,
          dssim: Number(c.preview.dssim.toFixed(5)),
          label: c.preview.label,
          uri: c.preview.dataUri,
        },
      })),
    })),
  };
}

const STYLE = `
:root { --bg:#0f172a; --panel:#1e293b; --ink:#e2e8f0; --muted:#94a3b8; --line:#334155; --accent:#38bdf8; }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--ink); }
header { padding:24px 28px 8px; }
h1 { margin:0 0 4px; font-size:22px; letter-spacing:-0.01em; }
.sub { color:var(--muted); font-size:14px; }
main { padding:12px 28px 48px; max-width:1100px; }
.tabs { display:flex; gap:6px; flex-wrap:wrap; margin:14px 0; }
.tab { padding:6px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel); color:var(--ink); cursor:pointer; font-size:13px; }
.tab.active { background:var(--accent); color:#04202e; border-color:var(--accent); font-weight:600; }
.grid { display:grid; grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); gap:22px; align-items:start; }
@media (max-width:860px){ .grid{ grid-template-columns:1fr; } }
.card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; }
.card h2 { margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); }
.viewer { position:relative; width:100%; border-radius:10px; overflow:hidden; background:#000; user-select:none; }
.viewer img { display:block; width:100%; height:auto; }
.viewer .after { position:absolute; inset:0; }
.viewer .after img { position:absolute; inset:0; height:100%; }
.viewer .handle { position:absolute; top:0; bottom:0; width:2px; background:var(--accent); }
.labels { display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin:6px 2px 0; }
.controls { margin-top:12px; }
input[type=range]{ width:100%; accent-color:var(--accent); }
.formats { display:flex; gap:6px; flex-wrap:wrap; margin:12px 0 6px; }
.fmt { padding:5px 10px; border-radius:8px; border:1px solid var(--line); background:#0b1324; color:var(--ink); cursor:pointer; font-size:13px; display:flex; align-items:center; gap:6px; }
.fmt .dot { width:9px; height:9px; border-radius:50%; }
.fmt.active { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; }
.stats { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:var(--muted); margin-top:8px; }
.stats b { color:var(--ink); font-variant-numeric:tabular-nums; }
svg { width:100%; height:auto; display:block; }
.readout { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
.readout th, .readout td { text-align:right; padding:4px 8px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
.readout th:first-child, .readout td:first-child { text-align:left; }
.readout .win td { color:#22d3ee; font-weight:600; }
.swatch { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; vertical-align:middle; }
.qline { display:flex; align-items:center; gap:10px; margin-top:12px; font-size:13px; color:var(--muted); }
.note { font-size:12.5px; color:var(--muted); line-height:1.5; margin:10px 2px 0; }
.note b { color:var(--ink); font-weight:600; }
.learn { margin-top:22px; }
.learn dl { display:grid; grid-template-columns:max-content 1fr; gap:8px 16px; margin:0; }
.learn dt { color:var(--ink); font-weight:600; }
.learn dd { margin:0; color:var(--muted); }
.learn a { color:var(--accent); text-decoration:none; }
.learn a:hover { text-decoration:underline; }
.links { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line); font-size:13px; }
.links span { color:var(--muted); }
.takeaway { margin:4px 2px 16px; padding:12px 16px; background:linear-gradient(90deg, rgba(56,189,248,0.12), rgba(56,189,248,0.02)); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; font-size:14.5px; color:var(--ink); }
.takeaway b { font-weight:700; }
`;

/** The page script, kept free of backticks/${} so it can live in a template literal. */
const SCRIPT = [
  "const DATA = JSON.parse(document.getElementById('data').textContent);",
  "let imgIdx = 0, codecId = DATA.images[0].codecs[0].id, wipe = 50, selS = DATA.target;",
  "const $ = (s, r) => (r||document).querySelector(s);",
  "const fmtKB = b => (b/1024).toFixed(1) + ' KB';",
  "function curImage(){ return DATA.images[imgIdx]; }",
  "function curCodec(){ return curImage().codecs.find(c => c.id === codecId) || curImage().codecs[0]; }",
  "function interp(points, s){",
  "  const pts = points; if (s <= pts[0].s) return pts[0]; if (s >= pts[pts.length-1].s) return pts[pts.length-1];",
  "  for (let i=1;i<pts.length;i++){ if (s <= pts[i].s){ const a=pts[i-1], b=pts[i]; const t=(s-a.s)/(b.s-a.s||1);",
  "    return { bpp:a.bpp+(b.bpp-a.bpp)*t, bytes:Math.round(a.bytes+(b.bytes-a.bytes)*t) }; } }",
  "  return pts[pts.length-1];",
  "}",
  "function xrange(){ let lo=100, hi=0; curImage().codecs.forEach(c=>c.points.forEach(p=>{lo=Math.min(lo,p.s);hi=Math.max(hi,p.s);})); return [Math.floor(lo-1), Math.ceil(hi+1)]; }",
  "function yMax(){ let m=0; curImage().codecs.forEach(c=>c.points.forEach(p=>{m=Math.max(m,p.bpp);})); return m*1.05; }",
  "function renderTabs(){ const t=$('#tabs'); t.innerHTML=''; DATA.images.forEach((im,i)=>{ const b=document.createElement('button'); b.className='tab'+(i===imgIdx?' active':''); b.textContent=im.name; b.onclick=()=>{imgIdx=i; codecId=curImage().codecs[0].id; selS=DATA.target; renderAll();}; t.appendChild(b); }); }",
  "function renderFormats(){ const f=$('#formats'); f.innerHTML=''; curImage().codecs.forEach(c=>{ const b=document.createElement('button'); b.className='fmt'+(c.id===codecId?' active':''); b.innerHTML='<span class=dot style=background:'+c.color+'></span>'+c.name; b.onclick=()=>{codecId=c.id; renderViewer(); renderFormats();}; f.appendChild(b); }); }",
  "function renderViewer(){ const im=curImage(), c=curCodec();",
  "  $('#before').src = im.original; $('#after-img').src = c.preview.uri;",
  "  $('#after').style.clipPath = 'inset(0 0 0 '+wipe+'%)'; $('#handle').style.left = wipe+'%';",
  "  $('#stats').innerHTML = 'format <b>'+c.name+'</b> &nbsp; setting <b>'+c.preview.label+'</b> &nbsp; size <b>'+fmtKB(c.preview.bytes)+'</b> &nbsp; bpp <b>'+c.preview.bpp.toFixed(3)+'</b> &nbsp; ss2 <b>'+c.preview.s.toFixed(2)+'</b> &nbsp; dssim <b>'+c.preview.dssim.toFixed(5)+'</b>';",
  "}",
  "function renderChart(){ const W=520,H=320,pad=44; const [x0,x1]=xrange(); const ym=yMax();",
  "  const sx=s=>pad+(s-x0)/(x1-x0)*(W-pad-12); const sy=b=>H-pad-(b/ym)*(H-pad-12);",
  "  let svg='<svg viewBox=\"0 0 '+W+' '+H+'\" role=img>';",
  "  for(let g=0;g<=4;g++){ const yy=pad+ (H-pad-12-0)*0; }",
  "  // grid + axes",
  "  for(let i=0;i<=4;i++){ const bx=x0+(x1-x0)*i/4; const X=sx(bx); svg+='<line x1='+X+' y1=12 x2='+X+' y2='+(H-pad)+' stroke=#26324a />'; svg+='<text x='+X+' y='+(H-pad+16)+' fill=#94a3b8 font-size=11 text-anchor=middle>'+bx.toFixed(0)+'</text>'; }",
  "  for(let i=0;i<=4;i++){ const by=ym*i/4; const Y=sy(by); svg+='<line x1='+pad+' y1='+Y+' x2='+(W-12)+' y2='+Y+' stroke=#26324a />'; svg+='<text x='+(pad-6)+' y='+(Y+4)+' fill=#94a3b8 font-size=11 text-anchor=end>'+by.toFixed(2)+'</text>'; }",
  "  svg+='<text x='+(W/2)+' y='+(H-6)+' fill=#94a3b8 font-size=12 text-anchor=middle>ssimulacra2 (higher = better)</text>';",
  "  svg+='<text transform=\"translate(12,'+(H/2)+') rotate(-90)\" fill=#94a3b8 font-size=12 text-anchor=middle>bpp (lower = smaller)</text>';",
  "  const gx=sx(selS);",
  "  svg+='<line x1='+gx+' y1=12 x2='+gx+' y2='+(H-pad)+' stroke=#38bdf8 stroke-width=1.5 stroke-dasharray=5,3 />';",
  "  svg+='<text x='+(gx+ (gx>0.7*W?-5:5))+' y=20 fill=#38bdf8 font-size=11 text-anchor='+(gx>0.7*W?'end':'start')+'>ss2 '+selS.toFixed(1)+'</text>';",
  "  curImage().codecs.forEach(c=>{ let d=''; c.points.forEach((p,i)=>{ d+=(i?'L':'M')+sx(p.s)+' '+sy(p.bpp)+' '; });",
  "    svg+='<path d=\"'+d+'\" fill=none stroke='+c.color+' stroke-width=2 />';",
  "    c.points.forEach(p=>{ svg+='<circle cx='+sx(p.s)+' cy='+sy(p.bpp)+' r=3 fill='+c.color+' />'; }); });",
  "  const right = gx>0.68*W, lx = right ? gx-9 : gx+9, anch = right ? 'end':'start';",
  "  let win=null; curImage().codecs.forEach(c=>{ const it=interp(c.points, selS); if(!win||it.bytes<win.bytes) win={c:c, it:it, cy:sy(it.bpp)}; });",
  "  curImage().codecs.forEach(c=>{ const it=interp(c.points, selS), cy=sy(it.bpp), isWin=c.id===win.c.id;",
  "    svg+='<circle cx='+gx+' cy='+cy+' r='+(isWin?6:4)+' fill='+c.color+' stroke=#0f172a stroke-width=1.5 />'; });",
  "  svg+='<text x='+lx+' y='+(win.cy-8)+' fill='+win.c.color+' font-size=11.5 font-weight=700 text-anchor='+anch+'>'+win.c.name+' '+fmtKB(win.it.bytes)+'</text>';",
  "  svg+='</svg>'; $('#chart').innerHTML=svg;",
  "}",
  "function renderReadout(){ const rows=curImage().codecs.map(c=>{ const it=interp(c.points, selS); return {c, bytes:it.bytes, bpp:it.bpp}; });",
  "  const min=Math.min.apply(null, rows.map(r=>r.bytes));",
  "  rows.sort((a,b)=>a.bytes-b.bytes);",
  "  let h='<table class=readout><tr><th>codec</th><th>size @ ss2 '+selS.toFixed(1)+'</th><th>bpp</th></tr>';",
  "  rows.forEach(r=>{ h+='<tr class='+(r.bytes===min?'win':'')+'><td><span class=swatch style=background:'+r.c.color+'></span>'+r.c.name+'</td><td>'+fmtKB(r.bytes)+'</td><td>'+r.bpp.toFixed(3)+'</td></tr>'; });",
  "  h+='</table>'; $('#readout').innerHTML=h; $('#qval').textContent=selS.toFixed(1);",
  "}",
  "function renderTakeaway(){ const cs=curImage().codecs.map(c=>({c:c, bytes:interp(c.points, DATA.target).bytes}));",
  "  const win=cs.reduce((a,b)=>b.bytes<a.bytes?b:a);",
  "  let base=cs.find(x=>x.c.id==='mozjpeg'); if(!base||base.c.id===win.c.id) base=cs.reduce((a,b)=>b.bytes>a.bytes?b:a);",
  "  const pct=Math.round((1-win.bytes/base.bytes)*100);",
  "  const baseName=base.c.id==='mozjpeg'?'mozjpeg (baseline JPEG)':base.c.name;",
  "  let msg='At equal quality (ssimulacra2 '+DATA.target+'), <b>'+win.c.name+'</b> is the smallest at <b>'+fmtKB(win.bytes)+'</b>';",
  "  if(win.c.id!==base.c.id && pct>0) msg+=', about <b>'+pct+'% smaller</b> than '+baseName;",
  "  $('#takeaway').innerHTML=msg+'.';",
  "}",
  "function renderAll(){ renderTabs(); renderTakeaway(); renderFormats(); renderViewer(); const [x0,x1]=xrange(); const q=$('#quality'); q.min=x0; q.max=x1; q.step=0.5; if(selS<x0)selS=x0; if(selS>x1)selS=x1; q.value=selS; renderChart(); renderReadout(); }",
  "$('#wipe').addEventListener('input', e=>{ wipe=+e.target.value; renderViewer(); });",
  "$('#quality').addEventListener('input', e=>{ selS=+e.target.value; renderChart(); renderReadout(); });",
  "renderAll();",
].join("\n");

/** Build the full standalone HTML document for a report. */
export function buildHtml(report) {
  const json = JSON.stringify(toClientData(report)).replace(/</g, "\\u003c");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Codec comparison — image-tools</title>",
    `<style>${STYLE}</style>`,
    "</head><body>",
    "<header><h1>Codec comparison</h1>",
    `<div class="sub">Equal-quality target: ssimulacra2 ${report.target}. Drag the wipe to compare original vs codec; move the quality slider to read size at any quality.</div></header>`,
    "<main>",
    '<div id="tabs" class="tabs"></div>',
    '<div id="takeaway" class="takeaway"></div>',
    '<div class="grid">',
    '<section class="card"><h2>Visual comparison</h2>',
    '<div id="viewer" class="viewer"><img id="before" alt="original">',
    '<div id="after" class="after"><img id="after-img" alt="codec"></div>',
    '<div id="handle" class="handle"></div></div>',
    '<div class="labels"><span>original</span><span>codec</span></div>',
    '<div class="controls"><input id="wipe" type="range" min="0" max="100" value="50"></div>',
    '<div id="formats" class="formats"></div>',
    '<div id="stats" class="stats"></div>',
    `<p class="note">These are the tool's <b>real encodes</b> at the target (ssimulacra2 ${report.target}), decoded back to PNG. Drag the divider to compare the original with the selected codec. The quality slider on the right does <b>not</b> re-encode or change these images — the encoders run offline, not in the browser.</p>`,
    "</section>",
    '<section class="card"><h2>Rate–distortion &amp; size at quality</h2>',
    '<div id="chart"></div>',
    '<div class="qline">quality (ssimulacra2): <input id="quality" type="range"> <b id="qval"></b></div>',
    '<div id="readout"></div>',
    '<p class="note">Each dot is one <b>real encode</b>. A curve that sits lower and to the right is better: more quality for fewer bytes. The <b>quality slider</b> reads, from each codec\'s measured curve, how large a file it needs to reach that quality (interpolating between measured points) — it does not run the encoders.</p>',
    "</section>",
    "</div>",
    '<section class="card learn">',
    "<h2>Understanding what you see</h2>",
    "<dl>",
    "<dt>Perceptual target</dt><dd>Every codec is tuned to the same ssimulacra2 score, so we compare file <b>size at equal quality</b>. That is fairer than comparing each codec's own quality number, since those scales are not equivalent.</dd>",
    '<dt>ssimulacra2</dt><dd>A perceptual quality score comparing the decoded image to the original: higher is closer, ~90 is visually near-transparent. <a href="https://github.com/cloudinary/ssimulacra2" target="_blank" rel="noopener">reference</a></dd>',
    "<dt>bpp</dt><dd>Bits per pixel = file size in bits ÷ number of pixels. Lower means a smaller file for the same image; it lets you compare images of different sizes.</dd>",
    '<dt>dssim</dt><dd>Structural dissimilarity: lower is closer to the original. Shown alongside ssimulacra2 as a second opinion. <a href="https://github.com/kornelski/dssim" target="_blank" rel="noopener">reference</a></dd>',
    "<dt>Rate–distortion</dt><dd>The size-vs-quality trade-off. Each codec's curve is its efficiency: the lower the curve, the fewer bytes it needs for the same quality.</dd>",
    "</dl>",
    '<div class="links"><span>Codecs:</span>' +
      '<a href="https://github.com/libjxl/libjxl" target="_blank" rel="noopener">JPEG XL</a>' +
      '<a href="https://web.dev/articles/compress-images-avif" target="_blank" rel="noopener">AVIF</a>' +
      '<a href="https://developers.google.com/speed/webp" target="_blank" rel="noopener">WebP</a>' +
      '<a href="https://github.com/google/jpegli" target="_blank" rel="noopener">jpegli</a>' +
      '<a href="https://github.com/mozilla/mozjpeg" target="_blank" rel="noopener">mozjpeg</a>' +
      '<a href="https://github.com/strukturag/libheif" target="_blank" rel="noopener">HEIC</a>' +
      "</div>",
    "</section>",
    "</main>",
    `<script id="data" type="application/json">${json}</script>`,
    `<script>${SCRIPT}</script>`,
    "</body></html>",
  ].join("\n");
}
