/**
 * ?perf: GPU timestamps on every compute and render pass, CPU frame timings, and per-frame
 * counts of submits, buffer writes and map requests, over a rolling window (`sim.perf`).
 *
 * Off by default: the device asks for 'timestamp-query' only under ?perf. While a frame is
 * open (frameBegin … frameEnd, around the loop body) the encoders' beginComputePass and
 * beginRenderPass are wrapped to add timestampWrites, so no pass site changes; frameEnd
 * resolves the frame's queries into one of a few staging buffers and reads them back a frame
 * or two late. Chrome quantizes timestamps to 100 µs unless it runs with
 * --enable-webgpu-developer-features (the tour harness's benchmark mode passes it).
 */

export const PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

const MAX_QUERIES = 4096;          // the device limit for one query set
const STAGING = 3;                 // frames in flight
const WINDOW = 600;                // frames kept for the summary

let active = null;                 // the profiler whose frame is open

function wrapPass(proto, name) {
    const orig = proto[name];
    proto[name] = function (desc) {
        const p = active;
        if (!p || !p._open || (desc && desc.timestampWrites)) return orig.call(this, desc);
        const i = p._count;
        if (i + 2 > MAX_QUERIES) { p._overflow++; return orig.call(this, desc); }
        p._count = i + 2;
        p._labels[i >> 1] = p._phase + ':' + ((desc && desc.label) || this.label || name);
        return orig.call(this, {
            ...desc,
            timestampWrites: { querySet: p.querySet, beginningOfPassWriteIndex: i, endOfPassWriteIndex: i + 1 },
        });
    };
}

let patched = false;
function patch() {
    if (patched) return;
    patched = true;
    wrapPass(GPUCommandEncoder.prototype, 'beginComputePass');
    wrapPass(GPUCommandEncoder.prototype, 'beginRenderPass');
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (bufs) { if (active?._cur) active._cur.submits++; return submit.call(this, bufs); };
    const write = GPUQueue.prototype.writeBuffer;
    GPUQueue.prototype.writeBuffer = function (...a) { if (active?._cur) active._cur.writes++; return write.apply(this, a); };
    const map = GPUBuffer.prototype.mapAsync;
    GPUBuffer.prototype.mapAsync = function (...a) {
        const p = active;
        if (!p) return map.apply(this, a);
        if (p._cur) p._cur.maps++;
        const t0 = performance.now();
        return map.apply(this, a).then((v) => { p._mapLatency.push(performance.now() - t0); return v; });
    };
}

function pct(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
function stats(values) {
    const s = values.filter(Number.isFinite).sort((a, b) => a - b);
    const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    return { p50: +pct(s, 0.5).toFixed(3), p95: +pct(s, 0.95).toFixed(3), mean: +mean.toFixed(3), n: s.length };
}

export default class GPUProfiler {
    constructor(device) {
        patch();
        this.device = device;
        this.timestamps = device.features.has('timestamp-query');
        if (this.timestamps) {
            this.querySet = device.createQuerySet({ type: 'timestamp', count: MAX_QUERIES, label: 'perf-queries' });
            this.resolve = device.createBuffer({ size: MAX_QUERIES * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, label: 'perf-resolve' });
            this._staging = Array.from({ length: STAGING }, (_, k) => ({
                buf: device.createBuffer({ size: MAX_QUERIES * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'perf-staging-' + k }),
                busy: false,
            }));
        }
        this.startup = {};          // ms marks since navigation start: device, physics, renderer, firstFrame
        this._open = false;
        this._phase = 'frame';
        this._count = 0;
        this._labels = [];
        this._overflow = 0;
        this._dropped = 0;
        this._cpu = [];             // per frame: { interval, step, render, total, substeps, submits, writes, maps }
        this._gpu = [];             // per frame: { busy, span, passes: { label: ms } }
        this._mapLatency = [];
        this._cur = null;
        this._lastStamp = 0;
        active = this;
        device.lost.then(() => { if (active === this) active = null; });
    }

    mark(name) {
        if (this.startup[name] === undefined) this.startup[name] = +performance.now().toFixed(1);
    }

    /** Open a frame: passes from here to frameEnd() are timed. */
    frameBegin(stamp) {
        if (active !== this) return;
        this._cur = { interval: this._lastStamp ? stamp - this._lastStamp : NaN, step: 0, render: 0, total: 0, substeps: 0, submits: 0, writes: 0, maps: 0 };
        this._lastStamp = stamp;
        this._t0 = performance.now();
        this._open = this.timestamps;
        this._count = 0;
        this._phase = 'frame';
    }

    /** Name the passes that follow (their labels read `phase:label`); time CPU work by phase. */
    phase(name) {
        if (active !== this || !this._cur) return;
        const now = performance.now();
        if (this._phaseAt !== undefined && this._phase in this._cur) this._cur[this._phase] += now - this._phaseAt;
        this._phase = name;
        this._phaseAt = now;
    }

    frameEnd(substeps) {
        if (active !== this || !this._cur) return;
        this.phase('frame');
        this._phaseAt = undefined;
        const cur = this._cur;
        cur.total = performance.now() - this._t0;
        cur.substeps = substeps;
        this._cur = null;
        this._open = false;
        // Paused, unrendered frames say nothing about cost
        if (cur.step > 0 || cur.render > 0) {
            this._cpu.push(cur);
            if (this._cpu.length > WINDOW) this._cpu.shift();
        }
        const n = this._count;
        this._count = 0;
        if (!this.timestamps || n === 0) return;
        const slot = this._staging.find((s) => !s.busy);
        if (!slot) { this._dropped++; return; }
        const labels = this._labels.slice(0, n >> 1);
        const enc = this.device.createCommandEncoder({ label: 'perf-resolve' });
        enc.resolveQuerySet(this.querySet, 0, n, this.resolve, 0);
        enc.copyBufferToBuffer(this.resolve, 0, slot.buf, 0, n * 8);
        this.device.queue.submit([enc.finish()]);
        slot.busy = true;
        const wasActive = active;
        active = null;               // this map is the profiler's own: don't count it
        const mapped = slot.buf.mapAsync(GPUMapMode.READ, 0, n * 8);
        active = wasActive;
        mapped.then(() => {
            const t = new BigUint64Array(slot.buf.getMappedRange(0, n * 8).slice(0));
            slot.buf.unmap();
            const passes = {};
            let busy = 0, lo = Infinity, hi = -Infinity;
            for (let k = 0; k < labels.length; k++) {
                const b = t[2 * k], e = t[2 * k + 1];
                if (b === 0n || e < b) continue;
                const ms = Number(e - b) / 1e6;
                passes[labels[k]] = (passes[labels[k]] || 0) + ms;
                busy += ms;
                const bn = Number(b) / 1e6, en = Number(e) / 1e6;
                if (bn < lo) lo = bn;
                if (en > hi) hi = en;
            }
            this._gpu.push({ busy, span: hi > lo ? hi - lo : 0, passes });
            if (this._gpu.length > WINDOW) this._gpu.shift();
        }).catch(() => {}).finally(() => { slot.busy = false; });
    }

    reset() {
        this._cpu.length = 0;
        this._gpu.length = 0;
        this._mapLatency.length = 0;
        this._overflow = 0;
        this._dropped = 0;
    }

    /** p50/p95 of every frame metric over the window, and each pass's mean ms per frame. */
    summary() {
        const cpu = this._cpu, gpu = this._gpu;
        const col = (k) => stats(cpu.map((f) => f[k]));
        const passMs = {};
        for (const f of gpu) for (const [k, v] of Object.entries(f.passes)) (passMs[k] || (passMs[k] = [])).push(v);
        const passes = Object.entries(passMs)
            .map(([k, v]) => {
                const s = stats(v.concat(new Array(Math.max(0, gpu.length - v.length)).fill(0)));
                return { pass: k, mean: s.mean, p95: s.p95, frames: v.length };
            })
            .sort((a, b) => b.mean - a.mean);
        return {
            frames: cpu.length,
            gpuFrames: gpu.length,
            interval: col('interval'),
            cpuTotal: col('total'),
            cpuStep: col('step'),
            cpuRender: col('render'),
            substeps: col('substeps'),
            submits: col('submits'),
            writes: col('writes'),
            maps: col('maps'),
            mapLatency: stats(this._mapLatency),
            gpuBusy: stats(gpu.map((f) => f.busy)),
            gpuSpan: stats(gpu.map((f) => f.span)),
            passes,
            overflow: this._overflow,
            dropped: this._dropped,
            timestamps: this.timestamps,
            startup: this.startup,
        };
    }

    /** A plain-text digest for the ?perf HUD. */
    digest(top = 10) {
        const s = this.summary();
        const f = (x) => x.toFixed(2);
        const lines = [
            `frame ${f(s.interval.p50)} ms (p95 ${f(s.interval.p95)})  cpu ${f(s.cpuTotal.p50)} / ${f(s.cpuTotal.p95)}`,
            `cpu step ${f(s.cpuStep.p50)}  render ${f(s.cpuRender.p50)}  substeps ${s.substeps.p50}`,
            `gpu busy ${f(s.gpuBusy.p50)} ms (p95 ${f(s.gpuBusy.p95)})  span ${f(s.gpuSpan.p50)}`,
            `submits ${s.submits.p50}  writes ${s.writes.p50}  maps ${s.maps.p50} (${f(s.mapLatency.p50)} ms)`,
        ];
        if (!s.timestamps) lines.push('no timestamp-query on this device');
        for (const p of s.passes.slice(0, top)) lines.push(`${f(p.mean).padStart(6)}  ${p.pass}`);
        return lines.join('\n');
    }
}
