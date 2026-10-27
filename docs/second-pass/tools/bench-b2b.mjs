// usage: node bench-b2b.mjs OUTDIR URL_A URL_B [scenarios.json] [reps=2] [names,…]
// Times each benchmark scenario's physics step and render back to back on tree A, then tree B,
// alternating: after the scenario's steps and warm-up the loop stops, and 40 calls of
// sim.gpu.stepOnce (one PHYSICS_DT) or sim.gpu.render run one after another, seven times each,
// wall time per call after onSubmittedWorkDone. The GPU's clocks are up, so this reads what the
// work costs rather than what a light scene's idle clocks make it read live (docs/ROADMAP.md §13).
// Prints the lowest of the seven per run, every run, for A → B. No ?perf.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, urlA, urlB, file = new URL('bench-scenarios.json', import.meta.url).pathname, reps = '2', names = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const only = names ? names.split(',') : null;
const scenarios = JSON.parse(readFileSync(file, 'utf8')).filter((s) => s.bench && (!only || only.includes(s.name)));

const ev = `(async () => {
  sim._frame = () => {};
  const d = sim._gpuPhysics.device;
  await new Promise((r) => setTimeout(r, 200));
  const time = async (fn, n) => {
    for (let i = 0; i < 5; i++) fn();
    await d.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    await d.queue.onSubmittedWorkDone();
    return (performance.now() - t0) / n;
  };
  const step = () => sim.gpu.stepOnce(sim), render = () => sim.gpu.render(sim);
  const s = [], r = [];
  for (let k = 0; k < 7; k++) { s.push(await time(step, 40)); r.push(await time(render, 40)); }
  return { step: Math.min(...s), render: Math.min(...r), alive: sim._gpuPhysics.aliveCount };
})()`;

const list = [];
for (let r = 0; r < +reps; r++) for (const s of scenarios) for (const [tag, url] of [['A', urlA], ['B', urlB]]) {
  const t = JSON.parse(JSON.stringify(s));
  delete t.bench;
  t.steps = (t.steps || []).map((x) => ({ ...x, shot: false }));
  t.steps.push({ js: '0', wait: s.bench.warm || 1500, shot: false });
  list.push({ ...t, name: `${tag}:${s.name}#${r}`, url, ev });
}
writeFileSync(`${out}/b2b.json`, JSON.stringify(list));
const res = JSON.parse(execFileSync('node', [new URL('tour.mjs', import.meta.url).pathname, out, `${out}/b2b.json`],
  { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 }).toString());
writeFileSync(`${out}/b2b-results.json`, JSON.stringify(res, null, 1));

const runs = (tag, name, k) => [...Array(+reps).keys()].map((r) => res[`${tag}:${name}#${r}`]?.ev?.[k]);
const f = (v) => v.map((x) => typeof x === 'number' ? x.toFixed(3) : '—').join('/');
console.log('scenario'.padEnd(24), 'step A → B (ms)'.padStart(30), 'render A → B (ms)'.padStart(30), 'alive A → B'.padStart(16));
for (const s of scenarios) {
  console.log(s.name.padEnd(24), `${f(runs('A', s.name, 'step'))} → ${f(runs('B', s.name, 'step'))}`.padStart(30),
    `${f(runs('A', s.name, 'render'))} → ${f(runs('B', s.name, 'render'))}`.padStart(30),
    `${runs('A', s.name, 'alive')[0]} → ${runs('B', s.name, 'alive')[0]}`.padStart(16));
}
for (const [k, v] of Object.entries(res)) if (v.errs && v.errs.length) console.log(k, v.errs[0]);
