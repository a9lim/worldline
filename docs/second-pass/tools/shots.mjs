// usage: node shots.mjs OUTDIR [--presets a,b] [--themes light,dark] [--zooms fit,in,out]
//        [--frames N] [--seed S] [--width 1440] [--height 900] [--dpr 1]
//        [--view plane|spacetime] [--margin open|closed] [--jitter MS]
// Deterministic plate screenshots, for diffing a tree against another (shots-diff.mjs).
// WL_URL picks the server (default http://localhost:8791/worldline/); needs the same
// playwright-core and Chrome as tour.mjs.
//
// For each preset (PRESET_ORDER) and theme, one fresh page: freeze the preset into a reproducible
// frame, then screenshot it at each zoom as OUTDIR/{preset}-{theme}-{zoom}.png, plus
// OUTDIR/manifest.json (parameters, git rev, and fingerprints of the physics state per page).
//
// What makes a frame reproducible (everything the live loop leaves to chance):
//  - The loop is paused and its _frame stubbed. Frames are driven by hand, as the loop does:
//    accumulator += speedScale/60, gpu.step(), presetTick(). A preset's N frames are N*speed/60
//    simulated time whatever the machine's frame rate (kibbleZurek and microlensing run longer).
//  - After every frame the page waits out every readback in flight (every *Pending flag, and quench's
//    _pending) and every pipeline still being built. The last substep's maxAccel sets the next frame's
//    substep count and the ghost count sizes its arrays, so a readback landing a frame early or late
//    would change the integration; and the Higgs passes don't run until their pipelines exist, a race
//    with the first frames. reset() leaves maxAccel, the ghost count and the Higgs bath's noise key
//    at the opening scene's values, so the page zeroes them after the preset loads, as a fresh page has them.
//  - Math.random (only the Higgs initial noise uses it) is a seeded mulberry32, reseeded per preset.
//  - The toast is suppressed (a quiet load), CSS transitions are off, the opening tilt is cancelled
//    (a wheel event, as tour.mjs's __t.touch()), and the slow snapshots behind the caption and the
//    key (the scene read every 400 ms, the quench measurement every 250 ms) are forced, then the page
//    renders until its caption and key text stop changing.
//  - Each theme is its own page, opened in that scheme, never flipped: GPUPhysics._isDarkTheme is read
//    in the constructor and setToggles() but not on a theme change, so a flipped page keeps the old
//    theme's body inks until a setting changes, and differs from a page opened in the theme. The
//    physics is deterministic, so the two pages hold the same frame; the manifest checks the hashes.
//  - The zooms are the fitted camera (sim.fitCamera()), 2x and 0.5x about the domain's centre.
//  - Not stepped: wall-clock animation (the spacetime tilt, unless --view spacetime jumps there with
//    spacetime.set()), hover, and selection. --jitter MS waits a random time before the freeze, to
//    check that the frame doesn't remember the opening scene.
// What this can't remove is in AGENTS.md ("Running and checking"): run it twice to measure.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire('/Users/a9lim/Work/Exploratory/package.json');
const { chromium } = require('playwright-core');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.WL_URL || 'http://localhost:8791/worldline/';

// ── Options ──
const args = process.argv.slice(2);
const out = args.shift();
if (!out || out.startsWith('--')) { console.error('usage: node shots.mjs OUTDIR [options]; see the header'); process.exit(2); }
const opt = { presets: null, themes: 'light,dark', zooms: 'fit,in,out', frames: null, seed: '1', width: '1440', height: '900', dpr: '1', view: 'plane', margin: 'default', jitter: '0' };
for (let i = 0; i < args.length; i++) {
  const k = args[i].replace(/^--/, '');
  if (k in opt) opt[k] = args[++i];
  else { console.error('unknown option ' + args[i]); process.exit(2); }
}
const themes = opt.themes.split(',');
const ZOOMS = { fit: 1, in: 2, out: 0.5 };
const zooms = opt.zooms.split(',').map((z) => [z, ZOOMS[z] ?? +z]);
if (zooms.some(([, f]) => !(f > 0))) { console.error('bad --zooms ' + opt.zooms); process.exit(2); }
// Frames of 1/60 s at the preset's speed; most presets show their figure by 240 (the reduced-
// motion opening runs the same). The quench needs t > its 120 to order; the lens passes at ~120.
const FRAMES = { cyclotron: 240, twinBounce: 240, wheel: 240, bremsstrahlung: 240, kibbleZurek: 600, microlensing: 450 };
mkdirSync(out, { recursive: true });

// ── The page side ──
// Runs in the page (serialised by Playwright), so it uses no closure variables.
function driver() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const gp = () => sim._gpuPhysics;
  // Pipelines are built lazily and asynchronously (the shader files are fetched): the Higgs and
  // other field pipelines the first time a preset enables them, the clock, arrow and ring pipelines
  // again at every theme change. Frames run before they exist skip their passes, so the count of
  // such calls in flight is something to wait out. Every async _init*/_ensure* method is counted.
  const building = { n: 0 };
  for (const o of [sim.gpu, sim._gpuPhysics, sim._gpuRenderer]) {
    const proto = Object.getPrototypeOf(o);
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^_?(init|ensure)/.test(k) || typeof proto[k] !== 'function' || k === 'init') continue;
      const f = proto[k];
      proto[k] = function (...a) {
        const r = f.apply(this, a);
        if (r && typeof r.then === 'function') { building.n++; r.then(() => building.n--, () => building.n--); }
        return r;
      };
    }
  }
  const ready = () => Object.keys(sim._gpuRenderer).filter((k) => /Ready$/.test(k)).map((k) => +!!sim._gpuRenderer[k]).join('');
  const flags = () => {
    if (building.n > 0) return 'pipelines being built: ' + building.n;
    for (const [name, o] of [['physics', gp()], ['backend', sim.gpu], ['quench', sim.quench]]) {
      for (const k of Object.keys(o)) if ((/Pending$/.test(k) || k === '_pending') && o[k] === true) return name + '.' + k;
    }
    return null;
  };
  // Every submitted command finished and every readback delivered
  async function quiesce(limit = 15000) {
    const t0 = performance.now();
    for (;;) {
      await gp().device.queue.onSubmittedWorkDone();
      if (!flags()) return;
      if (performance.now() - t0 > limit) throw new Error('readback still pending: ' + flags());
      await sleep(0);
    }
  }
  // Wait for cond(), a frame at a time
  async function until(cond, what, limit = 8000) {
    const t0 = performance.now();
    while (!cond()) {
      if (performance.now() - t0 > limit) throw new Error('timeout: ' + what);
      await raf();
    }
  }
  // Same numbers for same bytes: two 32-bit FNV-1a lanes over the words
  function hashWords(w) {
    let a = 0x811c9dc5, b = 0x01000193 ^ w.length;
    for (let i = 0; i < w.length; i++) {
      a = Math.imul(a ^ w[i], 0x01000193);
      b = Math.imul(b ^ (w[i] >>> 7 | w[i] << 25), 0x85ebca6b) + a | 0;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  // Order-free: records (photons and pions land in the pool in atomic-append order) sorted first
  function hashRecords(u, words) {
    const rec = [];
    for (let i = 0; i + words <= u.length; i += words) rec.push(Array.from(u.subarray(i, i + words)));
    rec.sort((p, q) => { for (let k = 0; k < words; k++) if (p[k] !== q[k]) return p[k] < q[k] ? -1 : 1; return 0; });
    return hashWords(Uint32Array.from(rec.flat()));
  }

  // What the physics holds, as hashes of the raw bytes (layouts: gpu-buffers.js: ParticleState
  // 36 B, clocks 16 B, photon 32 B, pion 48 B)
  async function fingerprint() {
    const p = gp(), b = p.buffers, n = p.aliveCount;
    const raw = await p._readRanges([[b.particleState, 0, n * 36], [b.clocks, 0, n * 16], [b.phCount, 0, 4], [b.piCount, 0, 4]], 'fp');
    const ph = Math.min(new Uint32Array(raw, n * 52, 1)[0], b.photonPool.size / 32);
    const pi = Math.min(new Uint32Array(raw, n * 52 + 4, 1)[0], b.pionPool.size / 48);
    const bos = await p._readRanges([[b.photonPool, 0, ph * 32], [b.pionPool, 0, pi * 48]], 'fp2');
    const higgs = await p.readHiggsField();
    const f = new Float32Array(raw, 0, n * 9);
    const bodies = [];
    if (n <= 24) for (let i = 0; i < n; i++) bodies.push([0, 1, 2, 3].map((k) => f[i * 9 + k]));
    return {
      n, photons: ph, pions: pi, simTime: p.simTime, frameCount: p._frameCount, bodies,
      hash: {
        particles: hashWords(new Uint32Array(raw, 0, n * 9)),
        clocks: hashWords(new Uint32Array(raw, n * 36, n * 4)),
        photons: hashRecords(new Uint32Array(bos, 0, ph * 8), 8),
        pions: hashRecords(new Uint32Array(bos, ph * 32, pi * 12), 12),
        higgs: higgs ? hashWords(new Uint32Array(higgs.buffer)) : null,
      },
    };
  }

  const textState = () => (document.getElementById('caption-text').textContent + '|' + document.getElementById('scene-key').innerHTML
    + '|' + ready() + '|' + (sim.quench?.el?.ordered?.textContent ?? '') + '|' + (document.getElementById('control-panel').classList.contains('open') ? document.getElementById('control-panel').innerText : ''));

  // Everything slow and throttled brought up to the frozen state, then rendered until the text
  // on the page stops changing (a readback of one render feeds the next)
  async function settle(checks) {
    delete sim._frame;                         // the loop runs again, paused, so it renders and updates
    await quiesce();
    let prev = null, same = 0, rounds = 0;
    const refresh = async () => {
      const scene0 = sim.scene;
      sim.gpu._sceneAt = 0; sim._statsDirty = true; sim.caption.refresh(); sim.sceneKey._at = 0;
      if (sim.quench) sim.quench._at = 0;
      sim._dirty = true;
      await until(() => sim.scene !== scene0 && !sim.gpu._scenePending && !sim._statsDirty, 'snapshots');
      await raf(); await quiesce();
      sim._dirty = true; await raf(); await quiesce(); await raf();
    };
    while (same < checks && rounds++ < 12) {
      await refresh();
      const cur = textState();
      same = cur === prev ? same + 1 : 0;
      prev = cur;
    }
    if (same < checks) throw new Error('page text still changing after ' + rounds + ' rounds');
    return rounds;
  }

  async function freeze(name, frames, seed, view) {
    // Stop the loop's own stepping and drawing before anything else, then pause the usual way
    sim._frame = () => {};
    if (sim.running) document.getElementById('playBtn').click();
    await quiesce();
    let s = seed >>> 0;                         // mulberry32
    Math.random = () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    sim._openingScene = true;                   // quiet: no toast
    // The figure list's loader, or (a tree from before the margin's rework) the preset dropdown
    if (sim.loadFigure) sim.loadFigure(name);
    else { const select = document.getElementById('preset-select'); select.value = name; select.dispatchEvent(new Event('change')); }
    sim._openingScene = false;
    await quiesce();
    const p = gp();
    // A fresh page's values, not the opening scene's: reset() leaves these three, the last
    // substep's acceleration, the ghost count, and the key of the Higgs bath's noise (one per substep)
    p._maxAccel = 0; p._ghostCount = 0; p._noiseSeed = 0;
    sim.accumulator = 0;
    sim.fitCamera();
    if (view === 'spacetime') {
      const { EL_SPACETIME, AZ_SPACETIME } = await import('./src/spacetime.js');
      sim.spacetime.set(EL_SPACETIME, AZ_SPACETIME);
    }
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      sim.accumulator += sim.speedScale / 60;
      sim.gpu.step(sim);
      if (sim.presetTick) sim.presetTick();
      if (sim.quench && sim.settings.higgsEnabled && i % 15 === 14) { sim.quench._at = 0; sim.quench.update(); }
      await quiesce();
    }
    return { ms: Math.round(performance.now() - t0), alive: p.aliveCount };
  }

  async function show(factor) {
    await raf(); await raf();                  // layout (the margin) settles before the camera is fitted
    sim.fitCamera();
    const z = sim.camera.zoom * factor;
    sim.camera.reset(sim.physW / 2, sim.physH / 2, z);
    return { zoom: sim.camera.zoom };
  }

  window.__shots = { freeze, settle, show, fingerprint, quiesce };
}

// ── Run ──
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
let rev = '';
try { rev = execSync('git rev-parse --short HEAD && git status --porcelain | wc -l | tr -d " "', { cwd: new URL('.', import.meta.url).pathname }).toString().trim().replace('\n', ' +dirty:'); } catch {}
const manifest = { date: new Date().toISOString(), rev, url: BASE, options: opt, presets: {} };
const t00 = Date.now();

// The presets come from the page's own PRESET_ORDER
const probe = await browser.newContext();
const pg0 = await probe.newPage();
await pg0.goto(BASE, { waitUntil: 'domcontentloaded' });
const order = await pg0.evaluate(async () => (await import('./src/presets.js')).PRESET_ORDER);
await probe.close();
const presets = opt.presets ? opt.presets.split(',') : order;
for (const p of presets) if (!order.includes(p)) { console.error(`unknown preset ${p}; have ${order.join(', ')}`); process.exit(2); }

for (const name of presets) {
  const rec = { frames: opt.frames ? +opt.frames : FRAMES[name] ?? 240, shots: {}, fingerprints: {}, errors: [], seconds: 0 };
  manifest.presets[name] = rec;
  for (const theme of themes) {
    const t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width: +opt.width, height: +opt.height }, colorScheme: theme, deviceScaleFactor: +opt.dpr, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${theme} ${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => errs.push(`${theme} pageerror: ${e.message.slice(0, 200)}`));
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.sim && window.sim.gpu && window.sim.gpu.physics.aliveCount > 0, null, { timeout: 20000 });
      await page.evaluate(() => window.dispatchEvent(new Event('wheel')));    // takes the opening tilt (main.js _openScene)
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
      await page.evaluate(driver);
      // --jitter: let the opening scene run a random time first, to check the frame doesn't remember it
      if (+opt.jitter) await page.waitForTimeout(Math.random() * +opt.jitter);
      rec.freeze = await page.evaluate(([n, f, s, v]) => window.__shots.freeze(n, f, s, v), [name, rec.frames, (+opt.seed) * 7919 + 1, opt.view]);
      // The margin opens by itself on a wide window; 'closed' and 'open' force it
      if (opt.margin !== 'default') await page.evaluate((open) => { if (document.body.classList.contains('margin-open') !== open) document.getElementById('panelToggle').click(); }, opt.margin === 'open');
      await page.evaluate(() => window.__shots.settle(2));
      rec.fingerprints[theme] = await page.evaluate(() => window.__shots.fingerprint());
      for (const [zn, factor] of zooms) {
        const info = await page.evaluate((f) => window.__shots.show(f), factor);
        await page.evaluate(() => window.__shots.settle(2));
        const file = `${name}-${theme}-${zn}.png`;
        await page.screenshot({ path: `${out}/${file}` });
        rec.shots[file] = { ...info, theme: await page.evaluate(() => document.documentElement.dataset.theme) };
      }
    } catch (e) { rec.error = `${theme}: ${e.message.slice(0, 300)}`; }
    rec.errors.push(...errs.slice(0, 8));
    rec.seconds = +(rec.seconds + (Date.now() - t0) / 1000).toFixed(1);
    await ctx.close();
  }
  const fps = Object.values(rec.fingerprints);
  rec.themesAgree = fps.length < 2 || fps.every((f) => JSON.stringify(f.hash) === JSON.stringify(fps[0].hash));
  const fp = fps[0];
  const split = fps.length > 1 ? Object.keys(fps[0].hash).filter((k) => fps[0].hash[k] !== fps[1].hash[k]).join(',') : '';
  console.log(`${name.padEnd(15)} ${String(rec.seconds).padStart(5)}s  frames ${rec.frames}  n=${fp ? fp.n : '?'} photons=${fp ? fp.photons : '?'}  ${fp ? fp.hash.particles : ''}${rec.themesAgree ? '' : '  themes differ in ' + split}${rec.error ? '  ERROR ' + rec.error : ''}${rec.errors.length ? '  console:' + rec.errors.length : ''}`);
}
manifest.seconds = +((Date.now() - t00) / 1000).toFixed(1);
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`${Object.values(manifest.presets).reduce((n, p) => n + Object.keys(p.shots).length, 0)} shots in ${manifest.seconds}s -> ${out}`);
await browser.close();
