// usage: node shots-diff.mjs A_DIR B_DIR OUT_DIR [--threshold 8] [--min-pct 0] [--max-pct P] [--all]
// Compares two directories of PNGs from shots.mjs, matching files by name. A pixel counts as
// changed when any of its R, G, B channels differs by more than --threshold (default 8 of 255;
// the antialiasing of an unchanged scene stays under it, see AGENTS.md). Per image it prints the
// changed pixels (count and share), their bounding box and the largest channel step; writes
// OUT_DIR/diff/NAME.png (B faded, changes in magenta, dilated a pixel so single pixels show) and
// OUT_DIR/index.html, a contact sheet of A | B | diff for each changed image.
//   --min-pct P  images changing less than P% of their pixels count as unchanged (noise floor)
//   --max-pct P  exit 1 if any image changes more than P% (a gate; default: never fails on pixels)
//   --all        sheet every image, not just the changed ones
// Exit 1 as well when an image is missing from one side or the sizes differ.
// If both directories hold a manifest.json from shots.mjs, the physics fingerprints are compared too:
// identical hashes with changed pixels mean the drawing changed; differing hashes mean the physics did.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { readPng, writePng, shrink } from './png.mjs';

const args = process.argv.slice(2);
const pos = [];
const opt = { threshold: 8, 'min-pct': 0, 'max-pct': Infinity, all: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') opt.all = true;
  else if (args[i].startsWith('--') && args[i].slice(2) in opt) opt[args[i].slice(2)] = +args[++i];
  else if (args[i].startsWith('--')) { console.error('unknown option ' + args[i]); process.exit(2); }
  else pos.push(args[i]);
}
const [A, B, OUT] = pos;
if (!OUT) { console.error('usage: node shots-diff.mjs A_DIR B_DIR OUT_DIR [--threshold 8] [--min-pct 0] [--max-pct P] [--all]'); process.exit(2); }
mkdirSync(join(OUT, 'diff'), { recursive: true });
mkdirSync(join(OUT, 'thumb'), { recursive: true });
const pngs = (d) => readdirSync(d).filter((f) => f.endsWith('.png')).sort();
const fa = pngs(A), fb = pngs(B), inB = new Set(fb), inA = new Set(fa);
const names = fa.filter((f) => inB.has(f));
const THUMB = 440;
let problems = 0;

const rows = [];
for (const name of names) {
  const a = readPng(join(A, name)), b = readPng(join(B, name));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({ name, size: `${a.width}x${a.height} vs ${b.width}x${b.height}` });
    problems++;
    continue;
  }
  const { width: w, height: h } = a, n = w * h;
  const mask = new Uint8Array(n);
  let count = 0, maxStep = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    if (d > maxStep) maxStep = d;
    if (d > opt.threshold) {
      mask[i] = 1; count++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const pct = 100 * count / n;
  rows.push({ name, w, h, count, pct, bbox: count ? [x0, y0, x1, y1] : null, maxStep, changed: count > 0 && pct >= opt['min-pct'], a, b, mask });
}

// The diff image: B washed toward white and gray, the changes in magenta, each grown by a pixel
function diffImage(r) {
  const { w, h, b, mask } = r, out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4, g = 0.3 * b.data[o] + 0.59 * b.data[o + 1] + 0.11 * b.data[o + 2];
    const v = 255 - 0.35 * (255 - g);
    out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const o = (yy * w + xx) * 4;
      out[o] = 214; out[o + 1] = 0; out[o + 2] = 140;
    }
  }
  return { width: w, height: h, data: out };
}
// Its thumbnail keeps a changed pixel visible: a block holding any change is marked
function diffThumb(r, width) {
  const base = diffImage({ ...r, mask: new Uint8Array(r.w * r.h) });
  const t = shrink(base, width), k = r.w / width;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < width; x++) {
    let hit = false;
    for (let yy = Math.floor(y * k); yy < Math.min(r.h, Math.max(Math.floor(y * k) + 1, Math.floor((y + 1) * k))) && !hit; yy++)
      for (let xx = Math.floor(x * k); xx < Math.min(r.w, Math.max(Math.floor(x * k) + 1, Math.floor((x + 1) * k))); xx++) if (r.mask[yy * r.w + xx]) { hit = true; break; }
    if (hit) { const o = (y * width + x) * 4; t.data[o] = 214; t.data[o + 1] = 0; t.data[o + 2] = 140; }
  }
  return t;
}

const sheet = [];
for (const r of rows) {
  if (!r.a) continue;
  if (r.changed) writePng(join(OUT, 'diff', r.name), diffImage(r));
  if (r.changed || opt.all) {
    const stem = r.name.replace(/\.png$/, '');
    writePng(join(OUT, 'thumb', stem + '-a.png'), shrink(r.a, THUMB));
    writePng(join(OUT, 'thumb', stem + '-b.png'), shrink(r.b, THUMB));
    writePng(join(OUT, 'thumb', stem + '-d.png'), diffThumb(r, THUMB));
    sheet.push(r);
  }
}

// The table
const pad = (s, n) => String(s).padEnd(n);
const num = (x) => String(x).padStart(8);
console.log(`${A}  vs  ${B}   (changed = a channel off by more than ${opt.threshold}/255${opt['min-pct'] ? `, images under ${opt['min-pct']}% called unchanged` : ''})`);
console.log(pad('image', 34), 'changed px'.padStart(10), '%'.padStart(8), ' bbox x0,y0,x1,y1', ' maxStep');
let worst = 0, nChanged = 0;
for (const r of rows) {
  if (!r.a) { console.log(pad(r.name, 34), 'SIZE', r.size); continue; }
  worst = Math.max(worst, r.pct);
  if (r.changed) nChanged++;
  console.log(pad(r.name, 34), num(r.count).padStart(10), r.pct.toFixed(r.pct < 0.01 ? 4 : 3).padStart(8) + (r.changed ? '' : (r.count ? '~' : ' ')), ' ' + pad(r.bbox ? r.bbox.join(',') : '-', 18), String(r.maxStep).padStart(5));
}
for (const [side, list] of [['A', fa.filter((f) => !inB.has(f))], ['B', fb.filter((f) => !inA.has(f))]]) {
  if (!list.length) continue;
  problems += list.length;
  console.log(`${list.length} only in ${side}: ${list.slice(0, 6).join(', ')}${list.length > 6 ? ', ...' : ''}`);
}
console.log(`${rows.filter((r) => r.a).length} compared, ${nChanged} changed, worst ${worst.toFixed(3)}%${problems ? `, ${problems} missing or mis-sized` : ''}`);

// The physics, if both sides carry a manifest
const man = (d) => existsSync(join(d, 'manifest.json')) ? JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8')) : null;
const ma = man(A), mb = man(B);
const phys = [];
if (ma && mb) {
  console.log(`\nphysics fingerprints (${ma.rev} vs ${mb.rev}):`);
  for (const [p, ra] of Object.entries(ma.presets)) {
    const rb = mb.presets[p];
    if (!rb) { console.log('  ' + pad(p, 16), 'missing in B'); continue; }
    const lines = [];
    for (const theme of Object.keys(ra.fingerprints || {})) {
      const fa = ra.fingerprints[theme], fb = rb.fingerprints && rb.fingerprints[theme];
      if (!fb) continue;
      const differ = Object.keys(fa.hash).filter((k) => fa.hash[k] !== fb.hash[k]);
      let move = '';
      if (differ.length && fa.bodies.length && fa.bodies.length === fb.bodies.length) {
        let m = 0;
        fa.bodies.forEach((b0, i) => b0.forEach((v, k) => { m = Math.max(m, Math.abs(v - fb.bodies[i][k])); }));
        move = ` (largest body x, y, w change ${m.toExponential(1)})`;
      }
      lines.push(differ.length ? `${theme}: differs in ${differ.join(', ')}${move}` : null);
    }
    const bad = lines.filter(Boolean);
    const line = (bad.length ? bad.join('; ') : 'identical') + (ra.frames !== rb.frames ? ` (frames ${ra.frames} vs ${rb.frames})` : '');
    phys.push([p, line]);
    console.log('  ' + pad(p, 16), line);
  }
}

// The contact sheet
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = `<!doctype html><meta charset="utf-8"><title>shots-diff</title>
<style>
:root{--bg:#fcfcfb;--text:#161514;--muted:#666463;--rule:#16151420;--accent:#983432}
@media (prefers-color-scheme:dark){:root{--bg:#121111;--text:#ecebea;--muted:#949392;--rule:#ecebea22;--accent:#dc5960}}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--text);font:16px/1.5 Newsreader,'STIX Two Text',Georgia,serif}
h1{font-weight:400;font-size:28px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px}
section{border-top:1px solid var(--rule);padding:14px 0}
h2{font-weight:400;font-size:20px;margin:0}h2 span{color:var(--muted);font-size:15px;margin-left:8px;font-style:italic}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
figure{margin:0}figure img{width:100%;display:block;border:1px solid var(--rule)}
figcaption{color:var(--muted);font-size:14px;font-style:italic}
a{color:var(--accent)}ul{color:var(--muted);padding-left:18px}
@media (max-width:700px){.row{grid-template-columns:1fr}}
</style>
<h1>Plate diff</h1>
<p class="sub">${esc(basename(A))} against ${esc(basename(B))} &middot; changed = a channel off by more than ${opt.threshold}/255 &middot; ${nChanged} of ${rows.filter((r) => r.a).length} images changed${ma && mb ? ` &middot; ${esc(ma.rev)} &rarr; ${esc(mb.rev)}` : ''}</p>
${phys.length ? `<ul>${phys.map(([p, l]) => `<li>${esc(p)}: physics ${esc(l)}</li>`).join('')}</ul>` : ''}
${sheet.sort((p, q) => q.pct - p.pct).map((r) => {
  const stem = r.name.replace(/\.png$/, '');
  return `<section><h2>${esc(stem)}<span>${r.count} px (${r.pct.toFixed(3)}%)${r.bbox ? ` in ${r.bbox.join(',')}` : ''}, largest step ${r.maxStep}</span></h2>
<div class="row"><figure><a href="${esc(relative(resolve(OUT), resolve(A, r.name)))}"><img src="thumb/${esc(stem)}-a.png" alt="A"></a><figcaption>A</figcaption></figure>
<figure><a href="${esc(relative(resolve(OUT), resolve(B, r.name)))}"><img src="thumb/${esc(stem)}-b.png" alt="B"></a><figcaption>B</figcaption></figure>
<figure><a href="diff/${esc(r.name)}"><img src="thumb/${esc(stem)}-d.png" alt="diff"></a><figcaption>changes (full size: diff/${esc(r.name)})</figcaption></figure></div></section>`;
}).join('\n')}
${sheet.length ? '' : '<p>No image changed.</p>'}`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`sheet: ${join(OUT, 'index.html')} (${sheet.length} images)`);
process.exit(problems || worst > opt['max-pct'] ? 1 : 0);
