// ─── The figure caption ───
// One live italic line under the scene: "Fig. 3.", the figure's number in the list of figures,
// then its name and its live values (read from the scene snapshot, the stats and the GPU state),
// the observer's, and the selected body's, · between them. Rebuilt a few times a second, and
// written only on change. The figure's knobs (presets.js) are values you drag (controls.js
// Knob): the line marks one with a token, and the writer keeps each knob's element across
// rewrites, changing only the text around it, so a drag survives them.
import { getLang } from './i18n.js';
import { PRESET_ORDER, JET_D } from './presets.js';
import { Knob } from './controls.js';
import { FRAME_PARTICLE } from './frames.js';
import { radarCoords, acceleratedLine } from './radar.js';

// A knob's place in the line: \u0001key\u0002
const TOKEN = /\u0001(\w+)\u0002/;

const fmt = (x, d = 2) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d));
const speedOf = (b) => { const w2 = b.wx * b.wx + b.wy * b.wy; return { v: Math.sqrt(w2 / (1 + w2)), g: Math.sqrt(1 + w2) }; };

const TEXT = {
    en: {
        fig: (n) => (n ? `Fig. ${n}.` : 'Fig.'),
        sep: ' · ',
        bodies: (n) => `${n} ${n === 1 ? 'body' : 'bodies'}`,
        observer: (g, lag) => `γ ${g}` + (lag ? ` · now = lab − ${lag}` : ''),
        selected: (v, tau) => `red body ${v}c · τ ${tau}`,
        cyclotron: (B, E, d) => `B ${B} · E ${E} · E/B ${d}c`,
        twinBounce: (v, g, tt, th) => `v ${v}c · γ ${g} · traveller τ ${tt} · home τ ${th}`,
        accelerated: (a, h) => `α ${a} · horizon ${h} behind`,
        rindlerBody: (r, d) => `red body ruler ${r} · radar ${d}`,
        pastHorizon: 'red body past the horizon',
        seenSky: (v, g) => `v ${v}c · γ ${g}`,
        doppler: (up, down) => `D ahead ${up} · behind ${down}`,
        superluminal: (th, v) => `θ ${th}° · v ${v}c`,
        apparent: (u) => `apparent ${u}c`,
        wheel: (v, g, tm, tr) => `v ${v}c · γ ${g} · moving τ ${tm} · at rest τ ${tr}`,
        bremsstrahlung: (v, E) => `v ${v}c · radiated ${E}`,
        kzBefore: (T, tau) => `transition in ${T} · τ_Q ${tau}`,
        kzOrdering: (T, pct, tau) => `${T} past transition · ordered ${pct}% · τ_Q ${tau}`,
        kzAfter: (T, pct, n0, n, tau) => `${T} past transition · ordered ${pct}% · walls ${n0} → ${n} · τ_Q ${tau}`,
        microlensing: (M, rE, u, mu) => `M ${M} · R_E ${rE} · u ${u}` + (mu ? ` · μ ${mu}` : ''),
    },
    ja: {
        fig: (n) => (n ? `図${n}` : '図'),
        sep: '・',
        bodies: (n) => `物体${n}個`,
        observer: (g, lag) => `γ ${g}` + (lag ? `・今 = 実験室 − ${lag}` : ''),
        selected: (v, tau) => `赤い物体 ${v}c・τ ${tau}`,
        cyclotron: (B, E, d) => `B ${B}・E ${E}・E/B ${d}c`,
        twinBounce: (v, g, tt, th) => `v ${v}c・γ ${g}・旅人 τ ${tt}・家 τ ${th}`,
        accelerated: (a, h) => `α ${a}・地平線は後方 ${h}`,
        rindlerBody: (r, d) => `赤い物体 物差し ${r}・レーダー ${d}`,
        pastHorizon: '赤い物体は地平線の向こう',
        seenSky: (v, g) => `v ${v}c・γ ${g}`,
        doppler: (up, down) => `前方の D ${up}・後方 ${down}`,
        superluminal: (th, v) => `θ ${th}°・v ${v}c`,
        apparent: (u) => `見かけ ${u}c`,
        wheel: (v, g, tm, tr) => `v ${v}c・γ ${g}・動く車輪 τ ${tm}・静止 τ ${tr}`,
        bremsstrahlung: (v, E) => `v ${v}c・放射 ${E}`,
        kzBefore: (T, tau) => `転移まで${T}・τ_Q ${tau}`,
        kzOrdering: (T, pct, tau) => `転移から${T}・秩序化 ${pct}%・τ_Q ${tau}`,
        kzAfter: (T, pct, n0, n, tau) => `転移から${T}・秩序化 ${pct}%・壁 ${n0} → ${n}・τ_Q ${tau}`,
        microlensing: (M, rE, u, mu) => `M ${M}・R_E ${rE}・u ${u}` + (mu ? `・μ ${mu}` : ''),
    },
};

/**
 * The jet's apparent speed across the sky (presets.js superluminal), from the streak plate:
 * the newest blob whose track has begun, its slope where it leaves the core's direction (at
 * τ₀ = its ejection + the core's distance, at angle 0), times that distance. The slope is the
 * quadratic's through the track's start and its first two rows.
 */
function apparentSpeed(run, s) {
    if (!s || s.t == null) return null;
    for (let b = run.blobs.length - 1; b >= 0; b--) {
        const { idx, t } = run.blobs[b], tau0 = t + JET_D;
        const kStart = Math.floor((s.t - tau0) / s.dTau);
        if (kStart >= s.rows) continue;
        // The first two rows after τ₀, the first not too close to it
        const k1 = s.t - kStart * s.dTau - tau0 < 0.25 * s.dTau ? kStart - 1 : kStart, k2 = k1 - 1;
        if (k2 < 0) continue;
        const row = (k) => (k * s.sources + idx) * 4;
        if (s.data[row(k1) + 2] < 0.5 || s.data[row(k2) + 2] < 0.5) continue;
        const h1 = s.t - k1 * s.dTau - tau0, h2 = s.t - k2 * s.dTau - tau0;
        const p1 = s.data[row(k1)], p2 = s.data[row(k2)];
        const slope = (p1 * h2 * h2 - p2 * h1 * h1) / (h1 * h2 * (h2 - h1));
        return JET_D * Math.abs(slope);
    }
    return null;
}

export default class Caption {
    constructor(sim) {
        this.sim = sim;
        this.titleEl = document.getElementById('caption-title');
        this.el = document.getElementById('caption-text');
        this._force = true;
        this._at = -Infinity;
        this._text = null;
        this._sig = null;
        this._nodes = null;
        this._knobs = new Map();
    }

    /** Rewrite on the next update, without waiting out the throttle. */
    refresh() { this._force = true; }

    /** New knobs for a new figure (ui.js sim.knobs): one Knob element each, reused by every rewrite. */
    rebuildKnobs() {
        this._knobs = new Map(this.sim.knobs.map((k) => [k.key, new Knob({
            label: k.label, min: k.def.min, max: k.def.max, step: k.def.step, log: k.def.log, fmt: k.def.fmt,
            get: k.get, input: k.input, commit: k.commit,
        })]));
        this._sig = null;
        this._force = true;
    }

    /** Show the knobs' values (a scale or the store changed them). */
    syncKnobs() {
        for (const k of this._knobs.values()) k.sync();
        this._force = true;
    }

    /** A knob's token, or its value as text when the figure has no such knob. */
    _k(key, fallback) { return this._knobs.has(key) ? `\u0001${key}\u0002` : fallback; }

    /** Write the caption, at most every 250 ms unless forced: text nodes between kept knobs. */
    _write(text, force) {
        const now = performance.now();
        if (!force && now - this._at < 250) return;
        this._at = now;
        if (text === this._text) return;
        this._text = text;
        const parts = text.split(TOKEN);
        const keys = parts.filter((_, i) => i % 2);
        const sig = keys.join('|');
        if (sig === this._sig && this._nodes) {
            for (let i = 0; i < parts.length; i += 2) {
                const n = this._nodes[i / 2];
                if (n.data !== parts[i]) n.data = parts[i];
            }
            for (const k of keys) this._knobs.get(k)?.sync();
            return;
        }
        this._sig = sig;
        this._nodes = [];
        const children = [];
        parts.forEach((p, i) => {
            if (i % 2 === 0) {
                const n = document.createTextNode(p);
                this._nodes.push(n);
                children.push(n);
            } else {
                const k = this._knobs.get(p);
                k.sync();
                children.push(k.el);
            }
        });
        this.el.replaceChildren(...children);
    }

    /** The preset's live values; '' when the scene no longer fits it. */
    _presetText(L, key) {
        const sim = this.sim, gp = sim._gpuPhysics, ph = sim.settings;
        const bodies = sim.scene ? sim.scene.bodies : [];
        const body = (i) => (bodies[i] && bodies[i].alive ? bodies[i] : null);
        switch (key) {
            case 'cyclotron': {
                const B = Math.abs(ph.extBz), E = Math.abs(ph.extElectric);
                return B > 0 && E < B ? L.cyclotron(this._k('B', fmt(B)), this._k('E', fmt(E)), fmt(E / B)) : '';
            }
            case 'twinBounce': {
                const home = body(0), trav = body(1), c = gp?.prescribed.get(1);
                if (!home || !trav || !c) return '';
                const g = 1 / Math.sqrt(1 - c.v * c.v);
                return L.twinBounce(this._k('v', fmt(c.v)), fmt(g), fmt(trav.tau, 1), fmt(home.tau, 1));
            }
            case 'accelerated': {
                // The red body's distance from the observer by ruler (on its slice, in the
                // Rindler coordinates of the run's corner) and by radar, at the scene's event
                const run = sim.figureRun, a = run && run.alpha;
                if (!a) return '';
                const parts = [L.accelerated(this._k('alpha', a.toFixed(3)), fmt(1 / a))];
                const b = body(sim.selectedIdx);
                if (b && sim.scene.t != null) {
                    const X = b.x - run.xc, T = sim.scene.t - run.tc, Y = b.y - run.yo;
                    const r = radarCoords(acceleratedLine(run.xo, run.yo, run.tc, a, 1, 0), sim.scene.t, b.x, b.y);
                    if (X > Math.abs(T) && !r.beyond) {
                        parts.push(L.rindlerBody(fmt(Math.hypot(Math.sqrt(X * X - T * T) - 1 / a, Y)), fmt(r.distance)));
                    } else parts.push(L.pastHorizon);
                }
                return parts.join(L.sep);
            }
            case 'seenSky': {
                // On a coast the lamps on the axis are dead ahead and behind: their Doppler
                // factors from the streak plate's newest row
                const run = sim.figureRun, eye = run && body(run.select), c = gp?.prescribed.get(run?.select);
                if (!eye || !c) return '';
                const g = 1 / Math.sqrt(1 - c.v * c.v);
                const parts = [L.seenSky(this._k('v', fmt(c.v)), fmt(g))];
                const s = sim.frames.seeing ? gp.readStreak() : null;
                if (s) {
                    const D = run.axis.map((j) => (s.data[j * 4 + 2] > 0.5 ? s.data[j * 4 + 1] : NaN));
                    if (D.every(Number.isFinite)) parts.push(L.doppler(fmt(Math.max(...D)), fmt(Math.min(...D))));
                }
                return parts.join(L.sep);
            }
            case 'superluminal': {
                const run = sim.figureRun;
                if (!run || !run.blobs) return '';
                const parts = [L.superluminal(this._k('theta', fmt(run.knobs.theta, 0)), this._k('v', fmt(run.knobs.v)))];
                const u = sim.frames.seeing ? apparentSpeed(run, gp.readStreak()) : null;
                if (u) parts.push(L.apparent(fmt(u)));
                return parts.join(L.sep);
            }
            case 'wheel': {
                const rest = body(0), moving = body(1);
                if (!rest || !moving) return '';
                const { v, g } = speedOf(moving);
                return L.wheel(this._k('v', fmt(v)), fmt(g), fmt(moving.tau, 1), fmt(rest.tau, 1));
            }
            case 'bremsstrahlung':
                return L.bremsstrahlung(this._k('v', '0.95'), fmt(sim.stats.radiated || 0));
            case 'kibbleZurek': {
                // Before the transition, the time to it; after, what the field measures
                // (quench.js), the walls once most of the plane is near ±v and they are counted
                const q = gp && gp._higgsQuench;
                if (!q || !ph.higgsEnabled) return '';
                const left = q.tau - (gp.simTime - q.t0), tau = this._k('tau', fmt(q.tau, 0));
                if (left > 0) return L.kzBefore(fmt(left, 0), tau);
                const m = sim.quench && sim.quench.summary;
                const pct = m ? Math.round(100 * m.ordered) : 0;
                if (!m || !m.formed || m.ordered < 0.5) return L.kzOrdering(fmt(-left, 0), pct, tau);
                return L.kzAfter(fmt(-left, 0), pct, m.formed.walls.toPrecision(2), m.walls.toPrecision(2), tau);
            }
            case 'microlensing': {
                const lens = body(0), star = sim.lens.star;
                if (!lens || !star || !sim.lens.on) return '';
                const rE = Math.sqrt(4 * lens.m * sim.lens.distance);
                const wrap = (d, L) => d - L * Math.round(d / L);
                const u = Math.hypot(wrap(lens.x - star.x, sim.domainW), wrap(lens.y - star.y, sim.domainH)) / rE;
                const hits = gp && gp.lensHits;
                const mu = hits && hits.generation === sim.lens.gen && hits.magnification > 0 ? fmt(hits.magnification) : '';
                return L.microlensing(this._k('M', fmt(lens.m, 0)), fmt(rE, 1), fmt(u), mu);
            }
        }
        return '';
    }

    update() {
        const sim = this.sim;
        const L = TEXT[getLang()] || TEXT.en;
        const key = sim.figure || 'none';
        const fig = L.fig(PRESET_ORDER.indexOf(key) + 1);
        if (this.titleEl.textContent !== fig) this.titleEl.textContent = fig;
        const parts = [];
        if (key !== 'none' && window._i18n) parts.push(window._i18n.t('preset.' + key + '.name', ''));
        // A figure that opens in its own observer reads out its values there too
        const run = sim.figureRun, f = sim.frames;
        const own = !!(run && run.view && f.active && f.kind === run.view.kind
            && (f.kind !== FRAME_PARTICLE || f.slot === run.view.slot));
        let desc = '';
        if (f.active && !own) {
            const st = sim.frames.state;
            const v = st && st.valid ? Math.hypot(st.ux, st.uy) : sim.frames.boostSpeed;
            const g = 1 / Math.sqrt(1 - Math.min(v * v, 0.9999));
            parts.push(L.observer(fmt(g), st && st.valid && st.lag > 0.05 ? fmt(st.lag, 1) : ''));
        } else {
            // A preset reads out its own values; a scene that no longer fits it, its bodies
            desc = key !== 'none' ? this._presetText(L, key) : '';
            parts.push(desc || L.bodies(sim.gpu ? sim.gpu.physics.aliveCount : 0));
        }
        // The selected body, unless it is the figure's own and its values have named it
        const sel = sim.selectedIdx >= 0 ? sim.stats.selected : null;
        if (sel && !(desc && run && sim.selectedIdx === run.select)) parts.push(L.selected(fmt(sel.speed), fmt(sel.tau, 1)));
        this._write(parts.filter(Boolean).join(L.sep), this._force);
        this._force = false;
    }
}
