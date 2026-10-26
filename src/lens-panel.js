// ─── Backdrop panel ───
// The rulers are a backdrop seen through the bodies' masses as a thin lens
// (lens-deflection.wgsl) whenever Gravity is on (ui.js sets sim.lens.on with it). The Laws
// tab's Backdrop sets its projected distance 𝒟 = D_L·D_LS/D_S on a log scale (lab units, so
// R_E = √(4M𝒟)) and places the microlensing probe: a backdrop star, where the view's centre
// was, whose magnification the Measure tab plots as a light curve. sim.lens.gen counts
// changes, so a probe readback from before one is dropped.
const _PAL = window._PALETTE;
const CURVE_LEN = 400;

export default class LensPanel {
    constructor(sim) {
        this.sim = sim;
        const $ = (id) => document.getElementById(id);
        this.el = {
            curveGroup: $('lens-curve-group'),
            mu: $('lens-mu'),
            canvas: $('lens-curve'),
            probe: $('lensProbeToggle'),
            distance: $('lensDistanceInput'),
        };
        this.ctx = this.el.canvas.getContext('2d');
        this.curve = [];
        this._lastSeq = null;
        _forms.bindToggle(this.el.probe, v => this.setProbe(v));
        this.el.distanceValue = $('lensDistanceValue');
        _forms.bindSlider(this.el.distance, this.el.distanceValue, v => {
            sim.lens.distance = 10 ** v;
            this._restartCurve();
            sim._dirty = true;
        }, LensPanel.fmtDistance);
    }

    static fmtDistance(v) { return (10 ** v).toPrecision(2); }

    /** Show sim.lens's distance in its scale, without its handler. */
    sync() {
        const lens = this.sim.lens, el = this.el;
        const v = Math.log10(lens.distance);
        if (+el.distance.value !== v) {
            el.distance.value = v;
            _forms.updateSliderFill(el.distance);
            el.distance.setAttribute('aria-valuenow', el.distance.value);
            el.distanceValue.textContent = LensPanel.fmtDistance(+el.distance.value);
            this._restartCurve();
        }
        this.sim._dirty = true;
    }

    /** The star goes where the view's centre is now, a radius of 1/40 of the view. */
    setProbe(on, star = null) {
        const sim = this.sim;
        if (this.el.probe.checked !== on) this.el.probe.checked = on;
        if (on) {
            const cam = sim.camera;
            sim.lens.star = star ?? { x: cam.x, y: cam.y, r: Math.max(0.25, sim.width / cam.zoom / 40) };
        } else {
            sim.lens.star = null;
        }
        this._restartCurve();
        this.el.curveGroup.hidden = !on;
        sim._dirty = true;
    }

    /** A new configuration: an empty curve, and older readbacks ignored. */
    _restartCurve() {
        this.sim.lens.gen = (this.sim.lens.gen ?? 0) + 1;
        this.curve = [];
        this._lastSeq = null;
    }

    /** Collect the probe's latest magnification and redraw (each rendered frame). */
    update() {
        const sim = this.sim;
        if (!sim.lens.star) return;
        const h = sim._gpuPhysics?.lensHits;
        if (!h || h.seq === this._lastSeq || h.generation !== sim.lens.gen) return;
        this._lastSeq = h.seq;
        // Paused, the same instant only updates the readout
        const last = this.curve[this.curve.length - 1];
        if (last && last.t === h.t) last.mu = h.magnification;
        else this.curve.push({ t: h.t, mu: h.magnification });
        if (this.curve.length > CURVE_LEN) this.curve.shift();
        this.el.mu.textContent = h.magnification.toFixed(3);
        this.draw();
    }

    /** μ against lab time, with μ = 1 dashed. */
    draw() {
        const canvas = this.el.canvas;
        const w = canvas.parentElement.clientWidth || 240;
        const h = 72;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
        }
        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const c = this.curve;
        if (c.length < 2) return;
        const pal = this.sim.overlay.isLight ? _PAL.light : _PAL.dark;
        const pad = 6;
        let hi = 1;
        for (const s of c) if (s.mu > hi) hi = s.mu;
        const t0 = c[0].t, t1 = c[c.length - 1].t;
        const X = (tt) => pad + (w - 2 * pad) * (tt - t0) / Math.max(t1 - t0, 1e-9);
        const Y = (mu) => h - pad - (h - 2 * pad) * mu / (hi * 1.05);
        ctx.strokeStyle = pal.textMuted;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, Y(1));
        ctx.lineTo(w - pad, Y(1));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        c.forEach((s, i) => { if (i === 0) ctx.moveTo(X(s.t), Y(s.mu)); else ctx.lineTo(X(s.t), Y(s.mu)); });
        ctx.stroke();
        ctx.font = `italic 11px ${_FONT.text}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = pal.accent;
        ctx.fillText('μ', pad, pad - 2);
    }

}
