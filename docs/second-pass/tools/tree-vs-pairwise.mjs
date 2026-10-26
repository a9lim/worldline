// usage: node tree-vs-pairwise.mjs OUT.json [Ns=128,256,512,1024,2048,4096] [scenes=T,O,C,S,K]
//   env: WL_URL (default http://localhost:8791/worldline/), THETAS (0.1,0.2,0.3,0.5), ROUNDS (3), PASSES=1 (print passes)
// What the force pass costs and how far the tree is from the pairwise sum: headless GPUPhysics on
// the oracle page (tests/physics-validation.html), gravity only, Relativity off, bodies at rest.
// Scenes: T uniform torus, O uniform open (bounce walls), C Gaussian blob open, K blob on a torus,
// S sparse torus. Per N and θ: the tree's rms force error against the pairwise sum (allForces.f0
// after one update(0.001)), and the force pass's own GPU time (pairForce / treeForce timestamps from
// GPUProfiler, the median of 30 frames, the lowest of ROUNDS rounds interleaving the variants).
// docs/second-pass/bh-notes.md has the table this produced and how the rule was picked from it.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/a9lim/Work/Exploratory/package.json');
const { chromium } = require('playwright-core');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [out, ns = '128,256,512,1024,2048,4096', scenes = 'T,O,C,S,K'] = process.argv.slice(2);
const url = (process.env.WL_URL || 'http://localhost:8791/worldline/') + 'tests/physics-validation.html';
const THETAS = (process.env.THETAS || '0.1,0.2,0.3,0.5').split(',').map(Number);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-webgpu-developer-features'] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); });
await page.goto(url + '?perf', { waitUntil: 'networkidle' });

const fn = async ({ N, scene, thetas, timing, rounds }) => {
  const { default: GPUPhysics } = await import('/worldline/src/gpu/gpu-physics.js');
  const { TOGGLE_KEYS } = await import('/worldline/src/physics-contract.js');
  const { PHYSICS_DT, BOUND_LOOP } = await import('/worldline/src/config.js');
  const { PARTICLE_STATE_SIZE } = await import('/worldline/src/gpu/gpu-buffers.js');
  if (!window.__dev) {
    const adapter = await navigator.gpu.requestAdapter();
    const feats = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
    window.__dev = await adapter.requestDevice({ requiredFeatures: feats, requiredLimits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024, maxBufferSize: 256 * 1024 * 1024, maxComputeWorkgroupsPerDimension: 65535,
      maxStorageBuffersPerShaderStage: Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 10), maxBindingsPerBindGroup: adapter.limits.maxBindingsPerBindGroup } });
    window.__dev.addEventListener('uncapturederror', (e) => (window.__gpuErrs = window.__gpuErrs || []).push(e.error.message));
  }
  const device = window.__dev;
  const density = scene === 'S' ? 0.015 : 0.06;
  const W = Math.round(Math.sqrt(N / density));
  const gp = new GPUPhysics(device, W, W);
  await gp.init();
  gp.boundaryMode = (scene === 'T' || scene === 'S' || scene === 'K') ? BOUND_LOOP : 1;
  const p = { yukawaMu: 0.15, higgsMass: 0.5, axionMass: 0.05, hubbleParam: 0.001, extGravity: 0, extGravityAngle: 0, extElectric: 0, extElectricAngle: 0, extBz: 0, bounceFriction: 0.4, collisionMode: 0, yukawaCoupling: 14 };
  for (const k of TOGGLE_KEYS) p[k] = false;
  p.gravityEnabled = true;
  gp.setToggles(p);
  let s = 0x9E3779B9;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  for (let i = 0; i < N; i++) {
    let x, y;
    if (scene === 'C' || scene === 'K') { do { x = W / 2 + gauss() * W / 6; y = W / 2 + gauss() * W / 6; } while (x < 1 || y < 1 || x > W - 1 || y > W - 1); }
    else { x = r() * W; y = r() * W; }
    gp.addParticle({ x, y, mass: 0.5 + r() });
  }
  const readF = async () => {
    const bytes = N * 160;
    const st = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(gp.buffers.allForces, 0, st, 0, bytes);
    device.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(st.getMappedRange().slice(0));
    st.unmap(); st.destroy();
    const a = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) { a[2 * i] = f[i * 40]; a[2 * i + 1] = f[i * 40 + 1]; }   // f0.xy: gravity
    return a;
  };
  const accel = async (mode, th) => {
    gp.treeOverride = mode; gp.thetaOverride = th;
    gp.update(0.001);
    return await readF();
  };
  const ref = await accel('pairwise', null);
  const rms = (a, b) => { let num = 0, den = 0; for (let i = 0; i < 2 * N; i++) { num += (a[i] - b[i]) ** 2; den += b[i] * b[i]; } return Math.sqrt(num / den); };
  let mx = 0, rmsRef = 0;
  for (let i = 0; i < 2 * N; i++) { rmsRef += ref[i] * ref[i]; mx = Math.max(mx, Math.abs(ref[i])); }
  rmsRef = Math.sqrt(rmsRef / N);
  const ref2 = await accel('pairwise', null);        // pairwise vs pairwise: the noise floor of this method
  const res = { N, scene, W, rmsAccel: rmsRef, floor: rms(ref2, ref), err: {}, ms: {} };
  for (const th of thetas) res.err[th] = rms(await accel('tree', th), ref);
  if (timing) {
    const { default: GPUProfiler } = await import('/worldline/src/gpu/gpu-profiler.js');
    window.__perf = window.__perf || new GPUProfiler(device);
    const perf = window.__perf;
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const frames = async (n) => {
      perf.reset();
      for (let i = 0; i < n; i++) {
        perf.frameBegin(performance.now());
        gp.update(PHYSICS_DT);
        perf.frameEnd(1);
        await device.queue.onSubmittedWorkDone();
        await new Promise((r) => setTimeout(r, 3));
      }
      await new Promise((r) => setTimeout(r, 30));
      return perf._gpu;
    };
    const variants = [['pair', 'pairwise', null], ...thetas.map((t) => ['tree' + t, 'tree', t])];
    for (const [label, mode, th] of variants) { gp.treeOverride = mode; gp.thetaOverride = th; await frames(6); }   // clocks up, pipelines warm
    const force = {}, span = {};
    for (let round = 0; round < rounds; round++) for (const [label, mode, th] of variants) {
      gp.treeOverride = mode; gp.thetaOverride = th;
      const g = await frames(30);
      const f = g.map((x) => (x.passes['frame:pairForce'] ?? 0) + (x.passes['frame:treeForce'] ?? 0));
      (force[label] = force[label] || []).push(med(f));
      (span[label] = span[label] || []).push(med(g.map((x) => x.span)));
    }
    res.passes = {}; for (const [label, mode, th] of variants) { gp.treeOverride = mode; gp.thetaOverride = th; const g = await frames(20); const names = new Set(g.flatMap((x) => Object.keys(x.passes))); const o = {}; for (const nme of names) o[nme] = +med(g.map((x) => x.passes[nme] ?? 0)).toFixed(3); res.passes[label] = o; }
    for (const [label] of variants) { res.ms[label] = Math.min(...force[label]); res.ms[label + '_span'] = Math.min(...span[label]); }
  }
  gp.destroy();
  return res;
};

const results = [];
for (const scene of scenes.split(',')) for (const N of ns.split(',').map(Number)) {
  const t0 = Date.now();
  const r = await page.evaluate(`(${fn.toString()})(${JSON.stringify({ N, scene, thetas: THETAS, timing: true, rounds: +(process.env.ROUNDS || 3) })})`);
  results.push(r);
  if (process.env.PASSES) for (const [k, o] of Object.entries(r.passes)) console.log(k, Object.entries(o).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => n.replace('frame:', '') + ' ' + v).join(', '));
  console.log(scene, N, 'W', r.W, 'rmsA', r.rmsAccel.toExponential(2), 'floor', r.floor.toExponential(1),
    'err', THETAS.map((t) => (r.err[t] * 100).toFixed(3) + '%').join(' '),
    'force ms pair', r.ms.pair.toFixed(3), THETAS.map((t) => 'tree' + t + ' ' + r.ms['tree' + t].toFixed(3)).join(' '),
    '| span pair', r.ms.pair_span.toFixed(2), THETAS.map((t) => r.ms['tree' + t + '_span'].toFixed(2)).join(' '), `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  writeFileSync(out, JSON.stringify(results, null, 1));
}
const ge = await page.evaluate(() => window.__gpuErrs || []);
if (ge.length) console.log('GPU errors:', [...new Set(ge)].slice(0, 5));
if (errs.length) console.log('console:', [...new Set(errs)].slice(0, 8));
await browser.close();
