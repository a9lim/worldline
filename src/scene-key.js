// ─── The key ───
// The plate's Reference: a hairline box at the stage's bottom right naming each mark the scene is
// drawing now, and only those: the kinds of body present, their world lines and clocks, light,
// the spacetime view's cone and events, the Fields overlay's layers, the scalar fields' hatching,
// a uniform external field's direction, the lensed backdrop. Each swatch is drawn with the
// scene's own mark in the scene's own ink (marks.js). Rebuilt only when its rows change; G hides
// it with the rulers, and it stays out of a small stage. The same marks fill the margin's ticks,
// so the Laws tab reads as the scene's legend.
import { getLang } from './i18n.js';
import { CLOCK_PERIOD, BOUND_LOOP } from './config.js';
import { swatch } from './marks.js';

const WORDS = {
    en: {
        title: 'Reference',
        pos: 'Positive', neg: 'Negative', neutral: 'Neutral', anti: 'Antimatter',
        hole: 'Horizon, ergosphere',
        selected: 'Selected',
        trail: (n) => `World line · bead Δτ ${n}`,
        clock: (p) => `Clock · turn Δτ ${p}`,
        light: 'Light',
        cone: 'Past light cone',
        tick: 'Light of its ticks, arriving',
        restNow: 'Its now · rest frame',
        radarNow: 'Its now · radar',
        seenCone: 'Observer’s past light cone',
        horizon: (r) => `Horizons · corner 1/α = ${r} behind`,
        seenLight: 'Light seen now, in flight',
        approaching: 'Seen track · approaching',
        receding: 'Seen track · receding',
        future: 'Known future',
        event: 'Event',
        gravity: 'Gravitational potential',
        efield: 'Electric field lines',
        equi: 'Equipotentials ±',
        bz: 'B out, in',
        yukawa: 'Yukawa potential',
        higgs: 'Higgs ±v, wall',
        axion: 'Axion ±',
        extB: 'Uniform B',
        extE: 'Uniform E',
        extG: 'Uniform g',
        lens: 'Lensed backdrop',
        star: 'Backdrop star',
    },
    ja: {
        title: '凡例',
        pos: '正', neg: '負', neutral: '中性', anti: '反物質',
        hole: '地平線、エルゴ球',
        selected: '選択',
        trail: (n) => `世界線・珠 Δτ ${n}`,
        clock: (p) => `時計・一周 Δτ ${p}`,
        light: '光',
        cone: '過去光円錐',
        tick: '刻みの光、到着',
        restNow: 'その今・静止系',
        radarNow: 'その今・レーダー',
        seenCone: '観測者の過去光円錐',
        horizon: (r) => `地平面・角 1/α = ${r} 後方`,
        seenLight: '今見える光、伝播中',
        approaching: '見えた軌跡・接近',
        receding: '見えた軌跡・後退',
        future: '既知の未来',
        event: '事象',
        gravity: '重力ポテンシャル',
        efield: '電気力線',
        equi: '等電位線 ±',
        bz: '磁場 出・入',
        yukawa: '湯川ポテンシャル',
        higgs: 'ヒッグス ±v、壁',
        axion: 'アクシオン ±',
        extB: '一様な磁場',
        extE: '一様な電場',
        extG: '一様な重力',
        lens: 'レンズ越しの背景',
        star: '背景の星',
    },
};

export default class SceneKey {
    constructor(sim) {
        this.sim = sim;
        this.el = document.getElementById('scene-key');
        this._sig = null;
        this._at = 0;
    }

    /** Rebuild on the next update. */
    refresh() { this._at = 0; this._sig = null; }

    /** The rows the scene calls for now: [kind, text, swatch options]. */
    _rows(L) {
        const sim = this.sim, ph = sim.settings, view = sim.spacetime;
        const rows = [];
        const tilted = view && view.tilt > 0.05;
        const lab = !sim.frames.active;
        const bodies = sim.scene ? sim.scene.bodies : [];
        // The bodies by kind (each is drawn at least 2 px across, particle.wgsl)
        let pos = false, neg = false, neutral = false, anti = false, any = false;
        for (const b of bodies) {
            if (!b.alive) continue;
            any = true;
            if (b.anti) anti = true;
            if (b.q > 0.05) pos = true;
            else if (b.q < -0.05) neg = true;
            else neutral = true;
        }
        if (ph.blackHoleEnabled) {
            if (any) rows.push(['hole', L.hole]);
        } else {
            if (pos) rows.push(['pos', L.pos]);
            if (neg) rows.push(['neg', L.neg]);
            if (neutral) rows.push(['neutral', L.neutral]);
            if (anti) rows.push(['anti', L.anti]);
        }
        if (sim.selectedIdx >= 0) rows.push(['selected', L.selected]);
        if (any && (tilted || lab)) {
            const n = 2 ** Math.round(Math.log2(view.depth() / 14));
            rows.push(['trail', L.trail(n)]);
        }
        // Every body's outline is its clock, drawn once it is 5 px in radius (particle.wgsl)
        const clocks = bodies.some((b) => b.alive && Math.cbrt(b.m) * sim.camera.zoom >= 5);
        if (clocks && !ph.blackHoleEnabled) rows.push(['clock', L.clock(CLOCK_PERIOD)]);
        const seen = sim.frames.seeing;
        // The accelerated observer's horizons (spacetime-render.wgsl vs_horizon); from above,
        // the corner line alone
        if (sim.frames.active && sim.frames.kind === 6) rows.push(['horizon', L.horizon(Math.round(1 / sim.frames.alpha)), { plane: !tilted }]);
        // The streak plate's tracks, under the scene (src/streak.js)
        if (seen && bodies.length > 1) {
            rows.push(['track', L.approaching, {}]);
            rows.push(['track', L.receding, { receding: true }]);
        }
        if (tilted && seen) {
            // The observer's cone, in the accent only when the observer is the red body
            rows.push(['cone', L.seenCone, { ink: sim.frames.kind !== 2 }]);
            if (any) rows.push(['seenLight', L.seenLight]);
        } else if (tilted && sim.selectedIdx >= 0) rows.push(['cone', L.cone]);
        // The selected body's ticks' light, and its rays where the scene is small enough
        // (GPURenderer TICK_RECEIVERS); a prescribed body's known future (src/prescribed.js)
        if (tilted && sim.selectedIdx >= 0 && bodies.length > 1 && bodies.length <= 24) {
            rows.push(['tick', L.tick]);
            // And its simultaneity at each tick, on an open domain (GPURenderer _simulShown)
            if (sim.boundaryMode !== BOUND_LOOP) {
                rows.push(['simul', L.restNow, {}]);
                rows.push(['simul', L.radarNow, { radar: true }]);
            }
        }
        if (tilted && sim.spacetime.future() > 0) rows.push(['future', L.future]);
        if (tilted && any) rows.push(['event', L.event]);
        if ((sim.stats.photonE || 0) > 1e-6) rows.push(['light', L.light]);

        // The Fields overlay's layers (lab only), as GPUBackend.render picks them
        if (sim.heatmap.enabled && lab) {
            const m = sim.heatmap.mode, on = (k) => m === 'all' || m === k;
            if (ph.gravityEnabled && on('gravity')) rows.push(['gravity', L.gravity]);
            if (ph.coulombEnabled && on('electric')) {
                if (pos || neg) rows.push(['efield', L.efield]);
                if (m === 'electric') rows.push(['equi', L.equi]);
            }
            if ((ph.magneticEnabled || ph.extBz !== 0) && on('magnetic')) rows.push(['bz', L.bz]);
            if (ph.yukawaEnabled && on('yukawa')) rows.push(['yukawa', L.yukawa]);
        }
        if (ph.higgsEnabled && lab) rows.push(['higgs', L.higgs]);
        if (ph.axionEnabled && lab) rows.push(['axion', L.axion]);

        // A uniform external field has no structure to draw, so the key names it (its value is
        // the World tab's, and the cyclotron's caption's)
        if (ph.extBz) rows.push(['extB', L.extB, { into: ph.extBz > 0 }]);
        if (ph.extElectric) rows.push(['extE', L.extE, { angle: ph.extElectricAngle || 0 }]);
        if (ph.extGravity) rows.push(['extG', L.extG, { angle: ph.extGravityAngle || 0 }]);

        if (sim.lens.on && lab) {
            rows.push(['lens', L.lens]);
            if (sim.lens.star) rows.push(['star', L.star]);
        }
        return rows;
    }

    update() {
        const now = performance.now();
        if (now - this._at < 250) return;
        this._at = now;
        const sim = this.sim;
        const stage = this.el.parentElement;
        const room = stage.clientWidth >= 700 && stage.clientHeight >= 420;
        const L = WORDS[getLang()] || WORDS.en;
        const rows = room && sim.view.grid ? this._rows(L) : [];
        const sig = rows.length ? getLang() + rows.map((r) => r[0] + r[1] + JSON.stringify(r[2] || '')).join('|') : '';
        if (sig === this._sig) return;
        this._sig = sig;
        this.el.hidden = !rows.length;
        if (!rows.length) { this.el.replaceChildren(); return; }
        this.el.innerHTML = `<div class="scene-key-in"><p class="scene-key-title">${L.title}</p>`
            + rows.map(([kind, text, o]) => `<div class="scene-key-row">${swatch(kind, o)}<span>${text}</span></div>`).join('')
            + '</div>';
    }
}
