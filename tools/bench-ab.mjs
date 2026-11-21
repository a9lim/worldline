// usage: node bench-ab.mjs OUTDIR URL_A URL_B [scenarios.json] [w h dpr]
// Runs each benchmark scenario on tree A, then tree B, alternating, so whatever else is using the
// GPU meanwhile weighs on both alike; prints p50 (p95) GPU span, step and render spans, and CPU.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, urlA, urlB, file = new URL('bench-scenarios.json', import.meta.url).pathname, w = '1440', h = '900', dpr = '2'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const scenarios = JSON.parse(readFileSync(file, 'utf8')).filter((s) => s.bench);
const pairs = scenarios.flatMap((s) => [{ ...s, name: 'A:' + s.name, url: urlA }, { ...s, name: 'B:' + s.name, url: urlB }]);
writeFileSync(`${out}/pairs.json`, JSON.stringify(pairs));
execFileSync('node', [new URL('tour.mjs', import.meta.url).pathname, out, `${out}/pairs.json`, w, h, dpr], { stdio: ['ignore', 'ignore', 'inherit'] });
const bench = JSON.parse(readFileSync(`${out}/bench.json`, 'utf8')).scenarios;
const f = (v) => v ? `${v.p50.toFixed(2)} (${v.p95.toFixed(2)})` : '—';
console.log('scenario'.padEnd(24), 'span A → B'.padStart(30), 'step A → B'.padStart(26), 'render A → B'.padStart(26), 'cpu A → B'.padStart(16));
for (const s of scenarios) {
  const a = bench['A:' + s.name], b = bench['B:' + s.name];
  if (!a || !b) { console.log(s.name.padEnd(24), 'missing'); continue; }
  console.log(s.name.padEnd(24), `${f(a.gpuSpan)} → ${f(b.gpuSpan)}`.padStart(30),
    `${a.stepSpan.p50.toFixed(2)} → ${b.stepSpan.p50.toFixed(2)}`.padStart(26),
    `${a.renderSpan.p50.toFixed(2)} → ${b.renderSpan.p50.toFixed(2)}`.padStart(26),
    `${a.cpuTotal.p50.toFixed(2)} → ${b.cpuTotal.p50.toFixed(2)}`.padStart(16),
    s.bench.budget ? (b.gpuSpan.p50 > s.bench.budget.span || b.stepSpan.p50 > s.bench.budget.step ? '  B over budget' : '  ok') : '');
}
