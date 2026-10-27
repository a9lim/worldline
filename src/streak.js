// ─── The streak plate (roadmap §6.5) ───
// Under Seen, a band under the scene: a planar eye sees a one-dimensional image, directions on a
// circle, and stacked over the observer's proper time these images make a picture of everything
// it saw: direction across (the plate's reference direction at the centre, ±180° at the edges),
// its proper time upward, now at the top. Each source draws a track, its seen direction against
// τ. The track's weight reads its bolometric intensity, ×D⁴ (the planar convention's sources and
// light are 3+1), and its pattern its Doppler factor: solid approaching (D ≥ 1), dashed receding.
// So a fast observer's sky crowds forward, the twin's turnaround kinks every track and turns the
// receding ones solid, and apparent superluminal motion is a slope. GPUPhysics.requestStreak()
// computes the rows (frame-slice.wgsl streakRows); this draws the latest readback. A track ends
// where the source's history, or the observer's, runs out.
import { getLang } from './i18n.js';

const WORDS = {
    en: { now: 'now', ago: (n) => `τ − ${n}` },
    ja: { now: '今', ago: (n) => `τ − ${n}` },
};
const LEFT = 52;     // px for the τ labels
const BOTTOM = 18;   // px for the direction labels
const TOP = 14;
const RIGHT = 12;

export default class StreakPlate {
    constructor(sim) {
        this.sim = sim;
        this.band = document.getElementById('streak');
        this.canvas = document.getElementById('streakCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.seq = -1;
        this.shown = false;
    }

    /** Show the band while the view is Seen; true while shown. */
    update() {
        const on = this.sim.frames.seeing;
        if (on !== this.shown) {
            this.shown = on;
            this.band.hidden = !on;
            this.seq = -1;
        }
        return on;
    }

    /** Ask the GPU for new rows (a few times a second) and draw the newest that has arrived. */
    tick(physics, depth, frameCount) {
        if (!this.update()) return;
        if (frameCount % 6 === 0) {
            const dir = this.sim.frames.direction;
            physics.requestStreak({ dTau: depth / 128, forward: [Math.cos(dir), Math.sin(dir)] });
        }
        const s = physics.readStreak();
        if (s && s.seq !== this.seq) {
            this.seq = s.seq;
            this.draw(s);
        }
    }

    draw(s) {
        const c = this.canvas, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth, h = c.clientHeight;
        if (w < 40 || h < 30) return;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
            c.width = Math.round(w * dpr);
            c.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pal = _themePalette(), inks = pal.inks;
        const L = WORDS[getLang()] || WORDS.en;
        ctx.fillStyle = pal.canvas;
        ctx.fillRect(0, 0, w, h);
        const x0 = LEFT, x1 = w - RIGHT, y0 = TOP, y1 = h - BOTTOM;
        const X = (a) => x0 + (a / (2 * Math.PI) + 0.5) * (x1 - x0);
        const Y = (k) => y0 + (k / (s.rows - 1)) * (y1 - y0);

        // The frame: hairlines at ±180° (the edges), ±90° and 0, labelled below
        ctx.font = `italic 12px ${_FONT.text}`;
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 1;
        for (const deg of [-180, -90, 0, 90, 180]) {
            const x = Math.round(X(deg * Math.PI / 180)) + 0.5;
            ctx.strokeStyle = _alpha(pal.text, deg === 0 ? 0.3 : 0.12);
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
            ctx.fillStyle = pal.textMuted;
            ctx.textAlign = deg === -180 ? 'left' : deg === 180 ? 'right' : 'center';
            ctx.fillText(`${deg > 0 ? '+' : deg < 0 ? '−' : ''}${Math.abs(deg)}°`, x, h - 4);
        }
        // τ: now at the top, then nice steps down
        const span = s.dTau * (s.rows - 1);
        const step = _niceStep(span / 4);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let t = 0; t <= span + 1e-6; t += step) {
            const y = Math.round(Y(t / s.dTau)) + 0.5;
            ctx.strokeStyle = _alpha(pal.text, 0.08);
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
            ctx.fillStyle = pal.textMuted;
            ctx.fillText(t === 0 ? L.now : L.ago(_fmt(t)), x0 - 8, y);
        }

        // The tracks, in each source's ink (the selection's in the accent)
        const bodies = this.sim.scene ? this.sim.scene.bodies : [];
        const sel = this.sim.selectedIdx;
        const d = s.data;
        ctx.lineCap = 'round';
        for (let j = 0; j < s.sources; j++) {
            const b = bodies[j];
            if (!b) continue;
            const ink = j === sel ? pal.accent
                : b.q > 0.05 ? inks.sienna : b.q < -0.05 ? inks.prussian : pal.textMuted;
            ctx.strokeStyle = ink;
            for (let k = 0; k + 1 < s.rows; k++) {
                const a = (k * s.sources + j) * 4, n = ((k + 1) * s.sources + j) * 4;
                if (d[a + 2] < 0.5 || d[n + 2] < 0.5) continue;
                if (Math.abs(d[n] - d[a]) > Math.PI / 2) continue;   // across the ±180° edge
                const D = Math.sqrt(d[a + 1] * d[n + 1]);
                ctx.lineWidth = Math.min(2.6, Math.max(0.5, 1 + 0.18 * 4 * Math.log2(D)));
                ctx.setLineDash(D < 1 ? [3, 2.5] : []);
                ctx.beginPath();
                ctx.moveTo(X(d[a]), Y(k));
                ctx.lineTo(X(d[n]), Y(k + 1));
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
    }
}

function _niceStep(x) {
    const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)));
    for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p;
    return 10 * p;
}

const _fmt = (t) => (t >= 10 ? Math.round(t).toString() : t.toFixed(1).replace(/\.0$/, ''));

function _alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
