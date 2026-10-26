// ─── The key ───
// The plate's Reference: a hairline box at the stage's bottom right naming each mark the scene is
// drawing now, and only those: the kinds of body present, their world lines and clocks, light,
// the spacetime view's cone and events, the Fields overlay's layers, the scalar fields' hatching,
// a uniform external field with its value, the lensed backdrop. Each swatch is drawn with the
// scene's own mark in the scene's own ink (marks.js). Rebuilt only when its rows change; G hides
// it with the rulers, and it stays out of a small stage. The same marks fill the margin's ticks,
// so the Laws tab reads as the scene's legend.
import { getLang } from './i18n.js';
import { CLOCK_PERIOD } from './config.js';
import { swatch } from './marks.js';

const fmt = (x) => (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));

const WORDS = {
    en: {
        title: 'Reference',
        pos: 'Positive charge', neg: 'Negative charge', neutral: 'Neutral', anti: 'Antimatter, hollow',
        hole: 'A horizon, its ergosphere dashed',
        selected: 'The selected body',
        trail: (n) => `A world line from above, a bead every ${n} of proper time`,
        worldline: (n) => `A world line, a bead every ${n} of proper time`,
        clock: (p) => `Its outline is its clock, one turn per ${p} of proper time`,
        light: 'Light; a shorter wave carries more energy',
        cone: 'The red body’s past light cone',
        event: 'An event: a birth, death, merger or kick',
        gravity: 'Gravity’s potential, ticked downhill',
        efield: 'The charges’ electric field lines',
        equi: 'Equipotentials, + solid and − dashed',
        bz: 'B out of the plane, and into it',
        yukawa: 'Yukawa’s potential',
        higgs: 'The Higgs at +v and −v, a wall between',
        axion: 'The axion above and below zero',
        extB: (b, into) => `A uniform B of ${b}, ${into ? 'into' : 'out of'} the plane`,
        extE: (e) => `A uniform E of ${e}`,
        extG: (g) => `Uniform gravity of ${g}`,
        lens: 'The backdrop’s rulers, bent by the lens',
        star: 'The backdrop star’s images',
    },
    ja: {
        title: '凡例',
        pos: '正の電荷', neg: '負の電荷', neutral: '中性', anti: '反物質（中空）',
        hole: '地平線。破線はエルゴ球',
        selected: '選択した物体',
        trail: (n) => `上から見た世界線。固有時${n}ごとに珠`,
        worldline: (n) => `世界線。固有時${n}ごとに珠`,
        clock: (p) => `輪郭はその時計。固有時${p}で一周`,
        light: '光。波が短いほどエネルギーが大きい',
        cone: '赤い物体の過去光円錐',
        event: '事象：生成、消滅、合体、衝撃',
        gravity: '重力ポテンシャル。ひげは下りの側',
        efield: '電荷の電気力線',
        equi: '等電位線。＋は実線、−は破線',
        bz: '平面から出る磁場と、入る磁場',
        yukawa: '湯川ポテンシャル',
        higgs: 'ヒッグス場の＋vと−v、その間の壁',
        axion: 'アクシオン場の正と負',
        extB: (b, into) => `一様な磁場 ${b}、平面${into ? 'に入る' : 'から出る'}向き`,
        extE: (e) => `一様な電場 ${e}`,
        extG: (g) => `一様な重力 ${g}`,
        lens: 'レンズに曲げられた背景の目盛り',
        star: '背景の星の像',
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
            rows.push(['trail', tilted ? L.worldline(n) : L.trail(n)]);
        }
        // Every body's outline is its clock, drawn once it is 5 px in radius (particle.wgsl)
        const clocks = bodies.some((b) => b.alive && Math.cbrt(b.m) * sim.camera.zoom >= 5);
        if (clocks && !ph.blackHoleEnabled) rows.push(['clock', L.clock(CLOCK_PERIOD)]);
        if (tilted && sim.selectedIdx >= 0) rows.push(['cone', L.cone]);
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

        // A uniform external field has no structure to draw, so the key names it
        if (ph.extBz) rows.push(['extB', L.extB(fmt(Math.abs(ph.extBz)), ph.extBz > 0), { into: ph.extBz > 0 }]);
        if (ph.extElectric) rows.push(['extE', L.extE(fmt(ph.extElectric)), { angle: ph.extElectricAngle || 0 }]);
        if (ph.extGravity) rows.push(['extG', L.extG(fmt(ph.extGravity)), { angle: ph.extGravityAngle || 0 }]);

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
        const sig = rows.length ? getLang() + rows.map((r) => r[0] + r[1]).join('|') : '';
        if (sig === this._sig) return;
        this._sig = sig;
        this.el.hidden = !rows.length;
        if (!rows.length) { this.el.replaceChildren(); return; }
        this.el.innerHTML = `<div class="scene-key-in"><p class="scene-key-title">${L.title}</p>`
            + rows.map(([kind, text, o]) => `<div class="scene-key-row">${swatch(kind, o)}<span>${text}</span></div>`).join('')
            + '</div>';
    }
}
