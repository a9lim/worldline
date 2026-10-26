// ─── The Higgs quench ───
// The Kibble–Zurek figure's protocol and what it measures. startQuench() puts the Higgs in
// its symmetric phase, φ ≈ 0 under a Langevin bath, and ramps its mass term through the
// transition τ_Q later (GPUPhysics.setHiggsQuench); the Higgs section's Quench time slider
// re-runs it. QuenchPanel reads the field back a few times a second while a quench runs and
// measures it (measureHiggs): the ordered fraction, which the caption follows, and the wall
// density, which the Measure tab's Quench section and the caption show.
import { GPU_SCALAR_GRID } from './config.js';

const QUENCH_NOISE = 1e-4;   // the bath's temperature on the Higgs damping
const READ_EVERY = 250;      // ms between readbacks of the 128² grid

/** (Re)start the quench from the symmetric phase, at the store's τ_Q. */
export function startQuench(sim) {
    const gp = sim._gpuPhysics;
    if (!gp) return;
    gp.setField('higgs', () => 1e-3 * (Math.random() - 0.5));
    gp.setHiggsQuench(sim.settings.quenchTime, QUENCH_NOISE);
    sim.stats.resetBaseline();
    sim._dirty = true;
}

/**
 * What the Higgs field φ (N² cells over a W × H torus) holds at the quench parameter ε,
 * whose vacuum is v = √ε:
 * - `ordered`, the fraction of cells within v/2 of +v or −v;
 * - `settled`, whether the field has ordered by the Kibble–Zurek oracle's test
 *   (tests/physics-validation.html): mean |φ| at least v/2 and above the bath's thermal
 *   |φ| (0.2), so thermal sign flips aren't counted as walls;
 * - `crossings`, the oracle's count: sign changes between neighbouring cells per unit length
 *   of grid line, the walls a straight line crosses per unit length;
 * - `walls`, the wall length per unit area, π/2 times that (Cauchy–Crofton, for walls at
 *   every angle; along the grid's own axes the count reads π/4 of the length).
 */
export function measureHiggs(f, N, W, H, eps) {
    const v = Math.sqrt(Math.max(eps, 0));
    let near = 0, sum = 0, cross = 0;
    for (let y = 0; y < N; y++) {
        const row = y * N, below = ((y + 1) % N) * N;
        for (let x = 0; x < N; x++) {
            const p = f[row + x], a = Math.abs(p);
            sum += a;
            if (v > 0 && Math.abs(a - v) < 0.5 * v) near++;
            if (p * f[row + (x + 1) % N] < 0) cross++;
            if (p * f[below + x] < 0) cross++;
        }
    }
    const mean = sum / (N * N);
    const crossings = cross / (N * W + N * H);
    return {
        ordered: near / (N * N), mean, crossings, walls: Math.PI / 2 * crossings,
        settled: eps > 0 && mean >= Math.max(0.5 * v, 0.2),
    };
}

export default class QuenchPanel {
    constructor(sim) {
        this.sim = sim;
        const $ = (id) => document.getElementById(id);
        this.el = {
            section: $('quench-section'),
            eps: $('quench-eps'), ordered: $('quench-ordered'), formed: $('quench-formed'), walls: $('quench-walls'),
        };
        // The latest measurement, with `formed`, the walls when the field first settled (the
        // oracle's moment); null between quenches and until the first readback
        this.summary = null;
        this._q = null;
        this._gen = 0;
        this._pending = false;
        this._at = 0;
    }

    /** Each frame (main.js): read the field while a quench runs, a few times a second. */
    update() {
        const sim = this.sim, gp = sim._gpuPhysics;
        const q = gp && sim.settings.higgsEnabled ? gp._higgsQuench : null;
        if (q !== this._q) {
            // A new quench, or none: older readbacks are dropped
            this._q = q;
            this._gen++;
            this.summary = null;
            this._show();
        }
        if (!q || this._pending) return;
        const now = performance.now();
        if (now - this._at < READ_EVERY || (this.summary && this.summary.t === gp.simTime)) return;
        this._at = now;
        this._pending = true;
        const gen = this._gen, eps = gp.higgsQuenchEpsilon, t = gp.simTime;
        const W = gp.domainW, H = gp.domainH;
        gp.readHiggsField().then((f) => {
            if (!f || gen !== this._gen) return;
            const m = measureHiggs(f, GPU_SCALAR_GRID, W, H, eps);
            const formed = this.summary?.formed ?? (m.settled ? { walls: m.walls, crossings: m.crossings, t } : null);
            this.summary = { ...m, eps, t, since: t - q.t0 - q.tau, tau: q.tau, formed };
            this._show();
        }).catch(() => {}).finally(() => { this._pending = false; });
    }

    /** The Measure tab's readouts while a quench runs (its time is Kibble–Zurek's knob). */
    _show() {
        const el = this.el, s = this.summary, on = !!this._q;
        if (el.section.hidden === on) el.section.hidden = !on;
        if (!on) return;
        const fmtW = (w) => w.toPrecision(2);
        el.eps.textContent = s ? (s.eps < 0 ? '−' : '') + Math.abs(s.eps).toFixed(2) : '−1.00';
        el.ordered.textContent = s ? Math.round(100 * s.ordered) + '%' : '0%';
        el.formed.textContent = s && s.formed ? fmtW(s.formed.walls) : '—';
        el.walls.textContent = s && s.formed ? fmtW(s.walls) : '—';
    }
}
