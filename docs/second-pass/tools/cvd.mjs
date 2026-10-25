// usage: node cvd.mjs IMG_DIR OUT_DIR [--threshold 10] [--tokens PATH/shared/tokens.js]
// Colour-vision simulation, for checking the rule "pattern before hue". IMG_DIR is a directory of
// PNGs (shots.mjs output, tour.mjs shots); use `-` to skip the images and run the ink report alone.
//
//  1. Each PNG is rendered as protanopia, deuteranopia, tritanopia (full dichromacy) and as
//     grayscale, into OUT_DIR/{protan,deutan,tritan,gray}/NAME.png, with a contact sheet,
//     OUT_DIR/index.html: original | protan | deutan | tritan | gray, one row per image.
//  2. For both themes, the eleven inks of shared/tokens.js (_PALETTE.{light,dark}.inks) are put through
//     the same four simulations, and every pair is scored by CIEDE2000. Per simulation it prints the
//     smallest ΔE00 and the pairs under --threshold (default 10), marking those that were still apart
//     under normal vision (NEW: a pair the simulation collapses). The same for the pairs that
//     the accent (the one red) and graphite (textMuted, the neutral data hue) make with the inks, and for
//     each ink against the canvas. Written to OUT_DIR/inks.json and the sheet too. It reports; it never
//     fails on a collapse, because the design rule pairs every hue with a pattern.
//
// Method. Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of Color
// Vision Deficiency", IEEE TVCG 15(6), 2009, 1291-1298, doi:10.1109/TVCG.2009.113 (checked on
// Crossref). The matrices are Table 1 at severity 1.0, applied to linear RGB (sRGB decoded with the IEC
// 61966-2-1 curve, the result clamped to [0, 1] and encoded again). They were read out of the authors' page,
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html, by script (not
// typed), and agree to the sixth decimal with the severity-100 table of colorspacious (njsmith,
// colorspacious/cvd.py), which cites the same page. Grayscale is the relative luminance Y of
// linear sRGB (Rec. 709 weights), written back as a gray. ΔE00 is Sharma, Wu & Dalal 2005 on CIELAB
// under D65; the implementation reproduces their 34 test pairs (--selftest runs a sample of them).
// What this is not: a model of anomalous trichromacy (severity < 1 is milder than these), or of
// the viewing conditions (a thin line is harder to tell than the swatch score suggests).
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { readPng, writePng, shrink } from './png.mjs';

// ── Machado et al. 2009, Table 1, severity 1.0: row-major, applied to linear [R, G, B] ──
const MACHADO = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};
const SIMS = ['normal', 'protan', 'deutan', 'tritan', 'gray'];
const NAMES = { normal: 'normal vision', protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia', gray: 'grayscale' };

// ── Colour ──
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const ENC_N = 16384, ENC = new Uint8Array(ENC_N + 1);
for (let i = 0; i <= ENC_N; i++) { const l = i / ENC_N; ENC[i] = Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)); }
const enc = (l) => ENC[Math.round((l < 0 ? 0 : l > 1 ? 1 : l) * ENC_N)];
const Y_LIN = [0.2126729, 0.7151522, 0.0721750];

/** One colour, [r, g, b] in linear light, through a simulation; clamped. */
function simulate(sim, [r, g, b]) {
  if (sim === 'normal') return [r, g, b];
  if (sim === 'gray') { const y = Y_LIN[0] * r + Y_LIN[1] * g + Y_LIN[2] * b; return [y, y, y]; }
  const m = MACHADO[sim], c = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [c(m[0] * r + m[1] * g + m[2] * b), c(m[3] * r + m[4] * g + m[5] * b), c(m[6] * r + m[7] * g + m[8] * b)];
}
const hex2lin = (h) => [1, 3, 5].map((i) => LIN[parseInt(h.slice(i, i + 2), 16)]);
const lin2hex = (l) => '#' + l.map((v) => enc(v).toString(16).padStart(2, '0')).join('').toUpperCase();

const XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
const WHITE = [0.95047, 1, 1.08883];
function lab([r, g, b]) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [x, y, z] = XYZ.map((row, i) => (row[0] * r + row[1] * g + row[2] * b) / WHITE[i]).map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIEDE2000 (kL = kC = kH = 1), after Sharma, Wu & Dalal (2005), between two Lab colours. */
export function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, p7 = 25 ** 7;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + p7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2);
  const Lb = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) { hb = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : (hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2); }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + p7));
  const Sl = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

// ── Options ──
const args = process.argv.slice(2);
const opt = { threshold: 10, tokens: null };
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--selftest') opt.selftest = true;
  else if (args[i] === '--threshold' || args[i] === '--tokens') opt[args[i].slice(2)] = args[++i];
  else if (args[i].startsWith('--')) { console.error('unknown option ' + args[i]); process.exit(2); }
  else pos.push(args[i]);
}
opt.threshold = +opt.threshold;

// ── Self-test: the matrices keep neutrals neutral; sRGB white is D65 white; ΔE00 meets Sharma's data ──
if (opt.selftest || process.env.CVD_SELFTEST) {
  let bad = 0;
  for (const [k, m] of Object.entries(MACHADO)) for (let r = 0; r < 3; r++) {
    const s = m[3 * r] + m[3 * r + 1] + m[3 * r + 2];
    if (Math.abs(s - 1) > 3e-6) { console.error(`${k} row ${r} sums to ${s}`); bad++; }
  }
  const w = lab([1, 1, 1]);
  if (Math.abs(w[0] - 100) > 0.01 || Math.abs(w[1]) > 0.01 || Math.abs(w[2]) > 0.01) { console.error('white is', w); bad++; }
  // rows of ciede2000testdata.txt (Sharma's page): L1 a1 b1 L2 a2 b2 ΔE00
  for (const t of [[50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425], [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615], [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
    [50, 0, 0, 50, -1, 2, 2.3669], [50, 2.49, -0.001, 50, -2.49, 0.0011, 7.2195], [50, 2.5, 0, 73, 25, -18, 27.1492],
    [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263], [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441], [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082]]) {
    const d = deltaE00(t.slice(0, 3), t.slice(3, 6));
    if (Math.abs(d - t[6]) > 5e-5) { console.error('ΔE00', t, '->', d); bad++; }
  }
  console.log(bad ? `selftest: ${bad} failures` : 'selftest ok');
  process.exit(bad ? 1 : 0);
}

const [IMG, OUT] = pos;
if (!IMG || !OUT) { console.error('usage: node cvd.mjs IMG_DIR|- OUT_DIR [--threshold 10] [--tokens PATH] [--selftest]'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// ── The inks, read from the design system rather than copied ──
const here = new URL('.', import.meta.url).pathname;
const tokenPath = [opt.tokens, process.env.WL_TOKENS, resolve(here, '../../../../../shared/tokens.js'), '/Users/a9lim/Work/a9lim.github.io/shared/tokens.js'].filter(Boolean).find((p) => existsSync(p));
if (!tokenPath) { console.error('shared/tokens.js not found; pass --tokens'); process.exit(2); }
const win = {};
const el = { dataset: {}, style: { setProperty() {} }, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } };
runInNewContext(readFileSync(tokenPath, 'utf8'), { window: win, document: { documentElement: el, head: el, body: el, createElement: () => ({ ...el }), fonts: { load: () => Promise.resolve() }, querySelector: () => null }, console, FontFace: class {} });
const PALETTE = win._PALETTE;
if (!PALETTE || !PALETTE.light.inks) { console.error('no _PALETTE.light.inks in ' + tokenPath); process.exit(2); }

const report = { tokens: tokenPath, threshold: opt.threshold, themes: {} };
const pairs = (names) => names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]));
for (const theme of ['light', 'dark']) {
  const P = PALETTE[theme], inkNames = Object.keys(P.inks);
  const colors = { ...P.inks, graphite: P.textMuted, accent: P.accent, canvas: P.canvas };
  const t = { ground: P.canvas, sims: {} };
  for (const sim of SIMS) {
    const shown = Object.fromEntries(Object.entries(colors).map(([k, h]) => [k, simulate(sim, hex2lin(h))]));
    const L = Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, lab(v)]));
    const score = (ps) => ps.map(([a, b]) => ({ a, b, dE: deltaE00(L[a], L[b]) })).sort((x, y) => x.dE - y.dE);
    t.sims[sim] = {
      hex: Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, lin2hex(v)])),
      inks: score(pairs(inkNames)),
      // the two colours that aren't inks, against every ink
      extra: score(['accent', 'graphite'].flatMap((x) => inkNames.map((i) => [x, i]))).concat(score([['accent', 'graphite']])).sort((x, y) => x.dE - y.dE),
      ground: score(inkNames.map((i) => [i, 'canvas'])),
    };
  }
  report.themes[theme] = t;
}

// One decimal, two where rounding would put a pair that is under the threshold on it
const f1 = (x) => (x < opt.threshold && x.toFixed(1) === opt.threshold.toFixed(1) ? (Math.floor(x * 100) / 100).toFixed(2) : x.toFixed(1));
const pairKey = (p) => p.a + '-' + p.b;
// The pairs under the threshold, listed when they are few; when most pairs collapse, the pairs
// that survive are the shorter list
const say = (ps, normalOk) => {
  const low = ps.filter((p) => p.dE < opt.threshold), keep = ps.filter((p) => p.dE >= opt.threshold);
  if (!low.length) return null;
  const show = (p, normalOk) => `${p.a}/${p.b} ${f1(p.dE)}${normalOk && normalOk.has(pairKey(p)) ? '*' : ''}`;
  if (low.length <= 16) return low.map((p) => show(p, normalOk)).join(', ');
  const head = `${low.length} of ${ps.length} under (to ΔE ${f1(low[low.length - 1].dE)})`;
  return keep.length <= 12 ? head + '; still apart: ' + (keep.map((p) => `${p.a}/${p.b} ${f1(p.dE)}`).join(', ') || 'none') : head;
};
for (const theme of ['light', 'dark']) {
  const t = report.themes[theme];
  console.log(`\n${theme}: the eleven inks on the canvas ${t.ground}, CIEDE2000 (hard to tell apart: under ${opt.threshold})`);
  console.log('  ' + 'simulation'.padEnd(14) + 'min ΔE'.padStart(7) + '  ' + 'closest pair'.padEnd(20) + 'under'.padStart(6) + '  ' + 'ink vs canvas, min'.padEnd(26));
  const normalOk = new Set(t.sims.normal.inks.filter((p) => p.dE >= opt.threshold).map(pairKey));
  for (const sim of SIMS) {
    const s = t.sims[sim], lo = s.inks[0], low = s.inks.filter((p) => p.dE < opt.threshold), g = s.ground[0];
    console.log('  ' + NAMES[sim].padEnd(14) + f1(lo.dE).padStart(7) + '  ' + (lo.a + ' / ' + lo.b).padEnd(20) + String(low.length).padStart(6) + '  ' + `${f1(g.dE)} (${g.a})`);
  }
  for (const sim of SIMS) {
    const line = say(t.sims[sim].inks, sim !== 'normal' ? normalOk : null);
    if (line) console.log(`  ${NAMES[sim]}: ${line}`);
  }
  console.log(`  (* = a pair that normal vision separates, ΔE at least ${opt.threshold}: ${normalOk.size} of 55)`);
  console.log('  accent and graphite against the inks, and each other, under ' + opt.threshold + ':');
  for (const sim of SIMS) { const line = say(t.sims[sim].extra, null); if (line) console.log(`    ${NAMES[sim].padEnd(14)}${line}`); }
}

// ── Images ──
const rows = [];
const timing = { images: 0, ms: 0 };
if (IMG !== '-') {
  const t0 = Date.now();
  const files = readdirSync(IMG).filter((f) => f.endsWith('.png')).sort();
  for (const sim of SIMS.slice(1)) mkdirSync(join(OUT, sim), { recursive: true });
  mkdirSync(join(OUT, 'thumb'), { recursive: true });
  const TH = 320;
  for (const name of files) {
    const img = readPng(join(IMG, name)), stem = name.replace(/\.png$/, '');
    writePng(join(OUT, 'thumb', stem + '-normal.png'), shrink(img, TH));
    for (const sim of SIMS.slice(1)) {
      const out = new Uint8Array(img.data.length), d = img.data;
      const m = MACHADO[sim];
      for (let i = 0; i < d.length; i += 4) {
        const r = LIN[d[i]], g = LIN[d[i + 1]], b = LIN[d[i + 2]];
        if (sim === 'gray') {
          out[i] = out[i + 1] = out[i + 2] = enc(Y_LIN[0] * r + Y_LIN[1] * g + Y_LIN[2] * b);
        } else {
          out[i] = enc(m[0] * r + m[1] * g + m[2] * b); out[i + 1] = enc(m[3] * r + m[4] * g + m[5] * b); out[i + 2] = enc(m[6] * r + m[7] * g + m[8] * b);
        }
        out[i + 3] = 255;
      }
      const res = { width: img.width, height: img.height, data: out };
      writePng(join(OUT, sim, name), res);
      writePng(join(OUT, 'thumb', `${stem}-${sim}.png`), shrink(res, TH));
    }
    rows.push(stem);
  }
  timing.images = files.length; timing.ms = Date.now() - t0;
  console.log(`\n${files.length} images x 4 simulations -> ${OUT} in ${(timing.ms / 1000).toFixed(1)}s`);
}

// ── The sheet ──
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const inkBlock = ['light', 'dark'].map((theme) => {
  const t = report.themes[theme];
  return `<section><h2>${theme}<span>the eleven inks, CIEDE2000, under ${opt.threshold} is hard to tell apart</span></h2>
${SIMS.map((sim) => `<div class="sim"><div class="lab">${NAMES[sim]}</div><div class="sw" style="background:${t.ground}">${Object.keys(PALETTE[theme].inks).map((k) => `<i title="${k} ${t.sims[sim].hex[k]}" style="background:${t.sims[sim].hex[k]}"></i>`).join('')}</div>
<div class="pp">min ${f1(t.sims[sim].inks[0].dE)} (${esc(t.sims[sim].inks[0].a)}/${esc(t.sims[sim].inks[0].b)}); ${esc(say(t.sims[sim].inks, sim === 'normal' ? null : new Set(t.sims.normal.inks.filter((p) => p.dE >= opt.threshold).map(pairKey))) || 'none under')}</div></div>`).join('\n')}
<div class="names">${Object.keys(PALETTE[theme].inks).join(' &middot; ')}</div></section>`;
}).join('\n');
writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Colour-vision simulation</title>
<style>
:root{--bg:#fcfcfb;--text:#161514;--muted:#666463;--rule:#16151420}
@media (prefers-color-scheme:dark){:root{--bg:#121111;--text:#ecebea;--muted:#949392;--rule:#ecebea22}}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--text);font:16px/1.5 Newsreader,'STIX Two Text',Georgia,serif}
h1{font-weight:400;font-size:28px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px}
section{border-top:1px solid var(--rule);padding:14px 0}h2{font-weight:400;font-size:20px;margin:0 0 6px}h2 span{color:var(--muted);font-size:15px;margin-left:8px;font-style:italic}
.sim{display:grid;grid-template-columns:110px 330px 1fr;gap:10px;align-items:center;margin:3px 0}.lab{font-style:italic;color:var(--muted)}
.sw{display:flex;padding:6px;border:1px solid var(--rule)}.sw i{flex:1;height:22px}.pp{font-size:14px;color:var(--muted)}.names{font-size:14px;color:var(--muted);margin-left:120px}
.row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}figure{margin:0}img{width:100%;display:block;border:1px solid var(--rule)}figcaption{font-size:13px;color:var(--muted);font-style:italic}
@media (max-width:900px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}.sim{grid-template-columns:1fr}.names{margin-left:0}}
</style>
<h1>Colour-vision simulation</h1>
<p class="sub">Machado et al. 2009 at severity 1.0 in linear RGB, and Rec. 709 luminance for grayscale &middot; ${esc(IMG)}</p>
${inkBlock}
${rows.map((stem) => `<section><h2>${esc(stem)}</h2><div class="row">${SIMS.map((sim) => `<figure><a href="${sim === 'normal' ? esc(resolve(IMG, stem + '.png')) : `${sim}/${esc(stem)}.png`}"><img src="thumb/${esc(stem)}-${sim}.png" alt="${sim}"></a><figcaption>${NAMES[sim]}</figcaption></figure>`).join('')}</div></section>`).join('\n')}`);
writeFileSync(join(OUT, 'inks.json'), JSON.stringify({ ...report, timing }, null, 1));
console.log(`sheet: ${join(OUT, 'index.html')}`);
