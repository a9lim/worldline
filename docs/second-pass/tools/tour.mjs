// usage: node tour.mjs OUTDIR scenarios.json [width=1440] [height=900] [dpr=2]
// Each scenario: { name, scheme?, preset?, js?, wait?, margin? (bool), steps? [{js, wait}] }
// Benchmark mode: a scenario with bench: { warm = 1500, measure = 4000 } (ms) loads with ?perf,
// runs its steps, waits warm, resets the profiler, waits measure, and records sim.perf.summary()
// (src/gpu/gpu-profiler.js); all of them land in OUTDIR/bench.json. WL_URL overrides the server.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/a9lim/Work/Exploratory/package.json');
const { chromium } = require('playwright-core');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
// Runs against the sims server (launch.json "sims", port 8791). Each scenario may set preset,
// scheme, margin, steps [{ js, wait }], ev (evaluated after, printed). __t.* helpers are below.
const [out, file, width = '1440', height = '900', dpr = '2'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const scenarios = JSON.parse(readFileSync(file, 'utf8'));
// --enable-webgpu-developer-features: unquantized timestamp queries for benchmark mode
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-webgpu-developer-features'] });
const BASE = process.env.WL_URL || 'http://localhost:8791/worldline/';
const bench = {};
const HELPERS = `
window.__t = {
  preset(n) { const s = document.getElementById('preset-select'); s.value = n; s.dispatchEvent(new Event('change')); },
  tog(id, on) { const e = document.getElementById(id); if (e.checked !== on) e.click(); },
  click(id) { document.getElementById(id).click(); },
  slider(id, v) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); },
  margin(open) { if (document.body.classList.contains('margin-open') !== open) document.getElementById('panelToggle').click(); },
  touch() { window.dispatchEvent(new Event('wheel')); },
};`;
const results = {};
for (const sc of scenarios) {
  const w = sc.width || +width, h = sc.height || +height;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: sc.scheme || 'light', deviceScaleFactor: sc.dpr || +dpr, isMobile: w < 600, hasTouch: w < 600, reducedMotion: sc.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 240)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 240)));
  const query = sc.bench ? (sc.query ? sc.query + '&perf' : '?perf') : (sc.query || '');
  await page.goto((sc.url || BASE) + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.sim && window.sim.gpu && window.sim.gpu.physics.aliveCount > 0, null, { timeout: 15000 }).catch(() => errs.push('no gpu/alive'));
  await page.evaluate(HELPERS);
  if (!sc.keepOpening) await page.evaluate(() => window.__t.touch());
  if (sc.margin !== undefined) await page.evaluate(m => window.__t.margin(m), sc.margin);
  if (sc.preset) await page.evaluate(n => window.__t.preset(n), sc.preset);
  const steps = sc.steps || [{ js: sc.js || '', wait: sc.wait ?? 2500 }];
  let i = 0;
  for (const st of steps) {
    if (st.js) { try { await page.evaluate(st.js); } catch (e) { errs.push('step ' + i + ': ' + e.message.slice(0, 200)); } }
    await page.waitForTimeout(st.wait ?? 1500);
    if (st.shot ?? !sc.bench) await page.screenshot({ path: `${out}/${sc.name}${steps.length > 1 ? '-' + i : ''}.png` });
    i++;
  }
  if (sc.bench) {
    await page.waitForTimeout(sc.bench.warm ?? 1500);
    await page.evaluate(() => window.sim.perf?.reset());
    await page.waitForTimeout(sc.bench.measure ?? 4000);
    bench[sc.name] = await page.evaluate(() => {
      const p = window.sim.perf;
      return p ? { ...p.summary(), alive: window.sim.gpu.physics.aliveCount } : null;
    });
    if (sc.bench.shot) await page.screenshot({ path: `${out}/${sc.name}.png` });
  }
  let ev = null;
  if (sc.ev) { try { ev = await page.evaluate(sc.ev); } catch (e) { ev = 'ERR ' + e.message; } }
  results[sc.name] = { errs: errs.slice(0, 8), ev };
  await ctx.close();
}
console.log(JSON.stringify(results, null, 1));
if (Object.keys(bench).length) {
  const { execSync } = await import('node:child_process');
  let rev = '';
  try { rev = execSync('git rev-parse --short HEAD && git status --porcelain | wc -l', { cwd: new URL('.', import.meta.url).pathname }).toString().trim().replace('\n', ' +dirty:'); } catch {}
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto(BASE + '?perf');
  const adapter = await pg.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? { ...a.info, vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description } : null; });
  await ctx.close();
  writeFileSync(`${out}/bench.json`, JSON.stringify({ date: new Date().toISOString(), rev, adapter, viewport: [+width, +height, +dpr], scenarios: bench }, null, 1));
  for (const [k, v] of Object.entries(bench)) {
    if (!v) { console.log(k.padEnd(28), 'no profiler'); continue; }
    console.log(k.padEnd(28), `frame ${v.interval.p50.toFixed(2)}/${v.interval.p95.toFixed(2)}  cpu ${v.cpuTotal.p50.toFixed(2)}/${v.cpuTotal.p95.toFixed(2)}  gpu ${v.gpuBusy.p50.toFixed(2)}/${v.gpuBusy.p95.toFixed(2)}  span ${v.gpuSpan.p50.toFixed(2)}  sub ${v.substeps.p50}  submits ${v.submits.p50}  n=${v.alive}`);
  }
}
await browser.close();
