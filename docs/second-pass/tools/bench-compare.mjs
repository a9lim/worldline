// usage: node bench-compare.mjs BEFORE/bench.json AFTER/bench.json
// Per scenario, the p50 (and p95) GPU span, step and render spans, and CPU time, before → after.
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const pad = (s, n) => String(s).padStart(n);
const f = (x) => (x ?? NaN).toFixed(2);
const pick = (v) => v && { span: v.gpuSpan, step: v.stepSpan ?? v.gpuSpan, render: v.renderSpan ?? { p50: NaN, p95: NaN }, cpu: v.cpuTotal };
console.log(`${a.rev} → ${b.rev}   (ms, p50 [p95])`);
console.log('scenario'.padEnd(26), pad('span', 22), pad('step', 16), pad('render', 16), pad('cpu', 16));
for (const name of Object.keys(b.scenarios)) {
  const x = pick(a.scenarios[name]), y = pick(b.scenarios[name]);
  if (!x || !y) { console.log(name.padEnd(26), 'missing'); continue; }
  const cell = (k, w) => pad(`${f(x[k].p50)}→${f(y[k].p50)}`, w);
  console.log(name.padEnd(26), pad(`${f(x.span.p50)}→${f(y.span.p50)} [${f(y.span.p95)}]`, 22), cell('step', 16), cell('render', 16), cell('cpu', 16));
}
